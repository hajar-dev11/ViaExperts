<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreDocumentCommercialRequest;
use App\Http\Requests\UpdateDocumentCommercialRequest;
use App\Http\Resources\DocumentCommercialResource;
use App\Models\CabinetSetting;
use App\Models\DocumentCommercial;
use App\Models\DomiciliationSetting;
use App\Models\ServiceEnCours;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DocumentCommercialController extends Controller
{
    private const RELATIONS = ['lignes.service', 'client', 'entreprise'];

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

    private function settings(string $emetteur)
    {
        return $emetteur === 'via_experts'
            ? DomiciliationSetting::firstOrCreate([])
            : CabinetSetting::firstOrCreate([]);
    }

    /** Racine des colonnes de numérotation : facture_ | devis_ | bl_ | avoir_ */
    private function prefixeCle(string $type): string
    {
        return $type === 'avoir' ? 'avoir' : ($type === 'bl' ? 'bl' : $type);
    }

    private function composerNumero($settings, string $type): string
    {
        $cle = $this->prefixeCle($type);

        return trim(sprintf(
            '%s%s%s',
            $settings->{$cle.'_prefixe'} ?? '',
            $settings->{$cle.'_prochain_numero'} ?? '',
            $settings->{$cle.'_suffixe'} ?? ''
        ));
    }

    /**
     * Fait avancer le compteur après émission d'un document.
     *
     * Appelée DANS la transaction de création, avec `lockForUpdate()` sur la ligne
     * de paramètres : deux créations simultanées ne peuvent pas lire le même
     * compteur et produire deux fois le même numéro.
     *
     * Le compteur n'avance QUE si le numéro enregistré est bien celui qu'il
     * proposait : un numéro saisi manuellement par l'utilisateur ne le déplace pas.
     * Le format (préfixe/suffixe) n'est jamais modifié.
     */
    private function avancerCompteur(string $emetteur, string $type, string $numeroUtilise): void
    {
        $classe = $emetteur === 'via_experts' ? DomiciliationSetting::class : CabinetSetting::class;

        $classe::firstOrCreate([]); // garantit l'existence de la ligne singleton
        $settings = $classe::lockForUpdate()->first();

        if (! $settings || $this->composerNumero($settings, $type) !== $numeroUtilise) {
            return;
        }

        $colonne = $this->prefixeCle($type).'_prochain_numero';
        $courant = $settings->{$colonne};

        // La colonne est un entier non signé : un compteur vide n'est pas incrémenté.
        if ($courant === null || $courant === '') {
            return;
        }

        $settings->{$colonne} = (int) $courant + 1;
        $settings->save();
    }

    /** Numéro proposé : préfixe + prochain numéro + suffixe de l'émetteur choisi. */
    public function numeroPropose(Request $request, string $type)
    {
        $this->autoriser($request, 'ajouter', $type);

        $emetteur = $request->query('emetteur', 'bureau_comptabilite');
        abort_unless(in_array($emetteur, DocumentCommercial::EMETTEURS, true), 422);

        $settings = $this->settings($emetteur);

        return response()->json([
            'numero' => $this->composerNumero($settings, $type),
            'responsable' => $settings->nom_societe ?: ($emetteur === 'via_experts' ? 'Via Experts' : null),
        ]);
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
            ServiceEnCours::assurerServicesPourTiers($document->party_id, $document->lignes->pluck('service_id'), $request->user()->id);

            // Le compteur avance dans la MÊME transaction que la création.
            $this->avancerCompteur($document->emetteur, $type, $document->numero);

            return $document;
        });

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

        DB::transaction(function () use ($document, $data, $lignes, $request) {
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

            // Un service ajouté lors d'une modification apparaît lui aussi dans « Services en cours ».
            ServiceEnCours::assurerServicesPourTiers($document->party_id, $document->lignes->pluck('service_id'), $request->user()->id);
        });

        return new DocumentCommercialResource($document->fresh(self::RELATIONS));
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
