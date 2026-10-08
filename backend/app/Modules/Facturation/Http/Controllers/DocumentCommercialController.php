<?php

namespace App\Modules\Facturation\Http\Controllers;

use App\Contracts\Paiements\PaiementsDeFacture;
use App\Contracts\ServicesEnCours\AssureServicesEnCours;
use App\Http\Controllers\Controller;
use App\Modules\Facturation\Http\Requests\StoreDocumentCommercialRequest;
use App\Modules\Facturation\Http\Requests\UpdateDocumentCommercialRequest;
use App\Modules\Facturation\Http\Resources\DocumentCommercialResource;
use App\Modules\Facturation\Models\DocumentCommercial;
use App\Modules\Facturation\Services\NumerotationDocuments;
use App\Support\VerrouPaiements;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class DocumentCommercialController extends Controller
{
    private const RELATIONS = ['lignes.service', 'client', 'entreprise'];

    public function __construct(
        private NumerotationDocuments $numerotation,
        private AssureServicesEnCours $servicesEnCours,
        private PaiementsDeFacture $paiements,
    ) {
    }

    /**
     * Le catalogue de permissions `facturation` est décliné PAR TYPE de document
     * (liste_facture, ajouter_devis, archive_bon_livraison…). Le type étant un
     * paramètre de route, le contrôle se fait ici via User::hasPermission(),
     * qui reste la règle centrale du projet (admin = toujours autorisé).
     */
    private function autoriser(Request $request, string $action, string $type): void
    {
        $suffixe = DocumentCommercial::TYPES[$type] ?? abort(404);

        abort_unless($request->user()->hasPermission('facturation', "{$action}_{$suffixe}"), 403);
    }

    /** Numéro proposé : préfixe + prochain numéro + suffixe de l'émetteur choisi. */
    public function numeroPropose(Request $request, string $type)
    {
        $this->autoriser($request, 'ajouter', $type);

        $emetteur = $request->query('emetteur', 'bureau_comptabilite');
        abort_unless(in_array($emetteur, DocumentCommercial::EMETTEURS, true), 422);

        return response()->json($this->numerotation->proposer($emetteur, $type));
    }

    public function index(Request $request, string $type)
    {
        $this->autoriser($request, 'liste', $type);

        $query = DocumentCommercial::with(self::RELATIONS)
            ->type($type)
            ->status($request->query('status', 'actif'));

        if ($responsable = $request->query('responsable')) {
            $query->where('responsable', $responsable);
        }

        return DocumentCommercialResource::collection($query->orderByDesc('id')->get());
    }

    public function store(StoreDocumentCommercialRequest $request, string $type)
    {
        $this->autoriser($request, 'ajouter', $type);

        $data = $request->validated();
        $lignes = $data['lignes'];
        unset($data['lignes']);

        try {
            $document = DB::transaction(function () use ($data, $lignes, $type, $request) {
                $document = DocumentCommercial::create($data + [
                    'type' => $type,
                    'created_by' => $request->user()->id,
                ]);

                foreach (array_values($lignes) as $ordre => $ligne) {
                    $document->lignes()->create($ligne + ['ordre' => $ordre]);
                }

                $document->load('lignes');
                $document->recalculerTotaux();

                // Les services saisis sur les lignes apparaissent dans « Services en cours ».
                $this->servicesEnCours->assurerPourTiers($document->party_id, $document->lignes->pluck('service_id'), $request->user()->id);

                // Le compteur avance dans la MÊME transaction que la création.
                $this->numerotation->avancer($document->emetteur, $type, $document->numero);

                return $document;
            });
        } catch (QueryException $erreur) {
            // Collision sur l'index unique (type, numero) : jamais de doublon, et une réponse 422 au lieu d'un 500.
            $this->numerotation->convertirCollision($erreur);
            throw $erreur;
        }

        // `fresh()` fait perdre l'état « recently created » : on impose le 201.
        return (new DocumentCommercialResource($document->fresh(self::RELATIONS)))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Request $request, string $type, DocumentCommercial $document)
    {
        $this->autoriser($request, 'liste', $type);
        abort_if($document->type !== $type, 404);

        return new DocumentCommercialResource($document->load(self::RELATIONS));
    }

    public function update(UpdateDocumentCommercialRequest $request, string $type, DocumentCommercial $document)
    {
        $this->autoriser($request, 'ajouter', $type);
        abort_if($document->type !== $type, 404);

        $data = $request->validated();
        $lignes = $data['lignes'] ?? null;
        unset($data['lignes']);

        // Une FACTURE dont on touche aux lignes, au montant payé ou au client est modifiée sous le MÊME verrou que les
        // paiements : un paiement et une modification simultanés ne se croisent pas, et « total payé ≤ TTC » est évalué sur
        // l'état réel de cet instant.
        $controlerPaiements = $type === 'facture'
            && ($lignes !== null || array_key_exists('prix_paye', $data) || array_key_exists('party_id', $data));

        $modifier = function () use ($document, $data, $lignes, $request, $controlerPaiements) {
            DB::transaction(function () use ($document, $data, $lignes, $request, $controlerPaiements) {
                // Sous le verrou : état réel de la facture (un paiement a pu être enregistré pendant l'attente).
                if ($controlerPaiements) {
                    $document->refresh();
                }

                if ($controlerPaiements && array_key_exists('party_id', $data)
                    && (int) $data['party_id'] !== (int) $document->party_id
                    && $this->paiements->nombreActifs($document->id) > 0) {
                    throw ValidationException::withMessages(['party_id' => [
                        'Cette facture a déjà des paiements enregistrés : son client ne peut plus être modifié.',
                    ]]);
                }

                $document->update($data);

                // Les lignes sont remplacées intégralement quand elles sont fournies.
                if ($lignes !== null) {
                    $document->lignes()->delete();
                    foreach (array_values($lignes) as $ordre => $ligne) {
                        $document->lignes()->create($ligne + ['ordre' => $ordre]);
                    }
                }

                $document->load('lignes');
                $document->recalculerTotaux();

                // Ce qui est payé (paiements actifs + montant saisi à la main) ne peut pas dépasser le NOUVEAU TTC :
                // la transaction est annulée, la facture reste inchangée.
                if ($controlerPaiements) {
                    $this->refuserSiTotalPayeDepasseTtc($document);
                }

                // Un service ajouté lors d'une modification apparaît lui aussi dans « Services en cours ».
                $this->servicesEnCours->assurerPourTiers($document->party_id, $document->lignes->pluck('service_id'), $request->user()->id);
            });
        };

        try {
            $controlerPaiements ? VerrouPaiements::executer($modifier) : $modifier();
        } catch (QueryException $erreur) {
            $this->numerotation->convertirCollision($erreur);
            throw $erreur;
        }

        return new DocumentCommercialResource($document->fresh(self::RELATIONS));
    }

    /**
     * Refuse (HTTP 422, champ `prix_paye`) une facture dont le total payé dépasserait le TTC après modification.
     * Total payé = le plus grand du montant stocké (paiements + part saisie à la main) et de la somme des paiements actifs.
     */
    private function refuserSiTotalPayeDepasseTtc(DocumentCommercial $document): void
    {
        $ttc = round((float) $document->total_ttc, 2);
        $paye = max(round((float) $document->prix_paye, 2), $this->paiements->totalActifs($document->id));

        if ($paye > $ttc + 0.005) {
            throw ValidationException::withMessages(['prix_paye' => [sprintf(
                'Le total payé (%s Dh) dépasserait le total TTC de la facture (%s Dh). La facture n\'a pas été modifiée.',
                number_format($paye, 2, ',', ' '),
                number_format($ttc, 2, ',', ' ')
            )]]);
        }
    }

    public function archive(Request $request, string $type, DocumentCommercial $document)
    {
        $this->autoriser($request, 'archive', $type);
        abort_if($document->type !== $type, 404);
        $document->update(['status' => 'archive']);

        return new DocumentCommercialResource($document->load(self::RELATIONS));
    }

    public function corbeille(Request $request, string $type, DocumentCommercial $document)
    {
        $this->autoriser($request, 'corbeille', $type);
        abort_if($document->type !== $type, 404);
        $document->update(['status' => 'corbeille']);

        return new DocumentCommercialResource($document->load(self::RELATIONS));
    }

    public function restore(Request $request, string $type, DocumentCommercial $document)
    {
        $this->autoriser($request, 'archive', $type);
        abort_if($document->type !== $type, 404);
        $document->update(['status' => 'actif']);

        return new DocumentCommercialResource($document->load(self::RELATIONS));
    }

    public function destroy(Request $request, string $type, DocumentCommercial $document)
    {
        $this->autoriser($request, 'supprimer', $type);
        abort_if($document->type !== $type, 404);

        if ($document->status !== 'corbeille') {
            return response()->json([
                'message' => 'Seul un document déjà placé dans la Corbeille peut être supprimé définitivement.',
            ], 422);
        }

        $document->delete();

        return response()->json(['message' => 'Document supprimé définitivement.']);
    }
}
