<?php

namespace App\Http\Controllers\Api\V1;

use App\Modules\Facturation\Contracts\FacturesDisponibles;
use App\Http\Controllers\Controller;
use App\Http\Resources\PaiementResource;
use App\Models\Paiement;
use App\Models\ServiceEnCours;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class PaiementController extends Controller
{
    private const RELATIONS = ['lignes.service', 'client', 'entreprise'];

    public function __construct(private FacturesDisponibles $factures)
    {
    }

    private function regles(bool $partiel = false): array
    {
        $r = $partiel ? 'sometimes' : 'required';

        return [
            'emetteur' => [$r, 'in:via_experts,bureau_comptabilite'],
            'responsable' => ['nullable', 'string', 'max:150'],
            'party_id' => [$r, 'integer', 'exists:parties,id'],
            'document_id' => ['nullable', 'integer', 'exists:documents_commerciaux,id'],
            'date_operation' => [$r, 'date'],
            'date_credit' => ['nullable', 'date'],
            'mode_paiement' => ['nullable', 'string', 'max:40'],
            'signature' => ['nullable', 'boolean'],
            'observation' => ['nullable', 'string', 'max:5000'],
            'prix_paye' => ['nullable', 'numeric', 'min:0'],
            'piece_jointe' => ['nullable', 'file', 'max:5120'],

            'lignes' => [$partiel ? 'sometimes' : 'required', 'array', 'min:1'],
            'lignes.*.service_id' => ['nullable', 'integer', 'exists:services,id'],
            'lignes.*.designation' => ['required_with:lignes', 'string', 'max:255'],
            'lignes.*.quantite' => ['required_with:lignes', 'numeric', 'min:0'],
            'lignes.*.prix_unitaire' => ['required_with:lignes', 'numeric', 'min:0'],
        ];
    }

    public function index(Request $request)
    {
        abort_unless($request->user()->hasPermission('paiements', 'list_paiements'), 403);

        $query = Paiement::with(self::RELATIONS);

        // Filtrer par id précis (ex. depuis Mouvements entrées reçus) : on
        // cherche CE paiement quel que soit son statut, sans appliquer le
        // scope actif/archive/corbeille par défaut.
        if ($id = $request->query('id')) {
            $query->where('id', $id);
        } else {
            $query->status($request->query('status', 'actif'));
        }

        if ($responsable = $request->query('responsable')) {
            $query->where('responsable', $responsable);
        }

        if ($documentId = $request->query('document_id')) {
            $query->where('document_id', $documentId);
        }

        $paiements = $query->orderByDesc('id')->get();
        Paiement::chargerNumerosFactures($paiements);

        return PaiementResource::collection($paiements);
    }

    /**
     * Vue « Gestion des Paiements » : une ligne par service, avec les montants
     * du paiement parent. Le filtre `regle` reprend le second sélecteur de la capture.
     */
    public function gestion(Request $request)
    {
        abort_unless($request->user()->hasPermission('paiements', 'gestion_paiements'), 403);

        $paiements = Paiement::with(self::RELATIONS)
            ->status($request->query('status', 'actif'))
            ->orderByDesc('id')
            ->get();

        $lignes = $paiements->flatMap(function ($p) {
            return $p->lignes->map(fn ($l) => [
                'id' => $l->id,
                'paiementId' => $p->id,
                'reference' => $p->reference,
                'responsable' => $p->responsable,
                'client' => $p->tiers_nom,
                'clientId' => $p->client ? $p->party_id : null,
                'entrepriseId' => $p->entreprise ? $p->party_id : null,
                // Le vrai service du catalogue (relation `service_id`), jamais la
                // `designation` libre de la ligne : elle peut être éditée par
                // l'utilisateur et diverger du nom réel, voire ne correspondre à
                // aucun service existant (ligne sans service_id, ou service depuis
                // supprimé) — dans ce cas `null`, jamais un texte inventé.
                'service' => $l->service->nom ?? null,
                'prixTotal' => $p->total,
                'prixPaye' => $p->prix_paye,
                'prixRestant' => $p->prix_restant,
                'dateOperation' => optional($p->date_operation)->toDateString(),
                'dateCredit' => optional($p->date_credit)->toDateString(),
                'regle' => (float) $p->prix_restant <= 0,
            ]);
        })->values();

        if (($regle = $request->query('regle')) !== null && $regle !== '') {
            $attendu = filter_var($regle, FILTER_VALIDATE_BOOLEAN);
            $lignes = $lignes->filter(fn ($l) => $l['regle'] === $attendu)->values();
        }

        return response()->json($lignes);
    }

    public function show(Request $request, Paiement $paiement)
    {
        abort_unless($request->user()->hasPermission('paiements', 'list_paiements'), 403);

        return new PaiementResource($paiement->load(self::RELATIONS));
    }

    public function store(Request $request)
    {
        abort_unless($request->user()->hasPermission('paiements', 'ajouter_paiement'), 403);

        $data = $request->validate($this->regles());
        $lignes = $data['lignes'];
        unset($data['lignes'], $data['piece_jointe']);

        $paiement = DB::transaction(function () use ($request, $data, $lignes) {
            $data['reference'] = Paiement::prochaineReference();
            $data['created_by'] = $request->user()->id;

            if ($request->hasFile('piece_jointe')) {
                $file = $request->file('piece_jointe');
                $data['piece_jointe_chemin'] = $file->store('paiements', 'public');
                $data['piece_jointe_nom'] = $file->getClientOriginalName();
            }

            $paiement = Paiement::create($data);

            foreach (array_values($lignes) as $ordre => $ligne) {
                $paiement->lignes()->create($ligne + ['ordre' => $ordre]);
            }

            $paiement->load('lignes');
            $paiement->recalculerTotal();

            // Les services saisis sur les lignes apparaissent dans « Services en cours ».
            ServiceEnCours::assurerServicesPourTiers($paiement->party_id, $paiement->lignes->pluck('service_id'), $request->user()->id);

            // Option C : la facture rattachée est resynchronisée dans la même transaction.
            Paiement::synchroniserFacture($paiement->document_id);

            return $paiement;
        });

        return (new PaiementResource($paiement->fresh(self::RELATIONS)))
            ->response()
            ->setStatusCode(201);
    }

    public function update(Request $request, Paiement $paiement)
    {
        abort_unless($request->user()->hasPermission('paiements', 'ajouter_paiement'), 403);

        $data = $request->validate($this->regles(true));
        $lignes = $data['lignes'] ?? null;
        unset($data['lignes'], $data['piece_jointe']);

        $ancienDocument = $paiement->document_id;

        DB::transaction(function () use ($request, $paiement, $data, $lignes, $ancienDocument) {
            if ($request->hasFile('piece_jointe')) {
                if ($paiement->piece_jointe_chemin) {
                    Storage::disk('public')->delete($paiement->piece_jointe_chemin);
                }
                $file = $request->file('piece_jointe');
                $data['piece_jointe_chemin'] = $file->store('paiements', 'public');
                $data['piece_jointe_nom'] = $file->getClientOriginalName();
            }

            $paiement->update($data);

            if ($lignes !== null) {
                $paiement->lignes()->delete();
                foreach (array_values($lignes) as $ordre => $ligne) {
                    $paiement->lignes()->create($ligne + ['ordre' => $ordre]);
                }
            }

            $paiement->load('lignes');
            $paiement->recalculerTotal();

            // Un service ajouté lors d'une modification apparaît lui aussi dans « Services en cours ».
            ServiceEnCours::assurerServicesPourTiers($paiement->party_id, $paiement->lignes->pluck('service_id'), $request->user()->id);

            // Resynchroniser l'ancienne facture si le rattachement a changé.
            Paiement::synchroniserFacture($ancienDocument);
            Paiement::synchroniserFacture($paiement->document_id);
        });

        return new PaiementResource($paiement->fresh(self::RELATIONS));
    }

    private function changerStatut(Paiement $paiement, string $status): PaiementResource
    {
        DB::transaction(function () use ($paiement, $status) {
            $paiement->update(['status' => $status]);
            Paiement::synchroniserFacture($paiement->document_id);
        });

        return new PaiementResource($paiement->fresh(self::RELATIONS));
    }

    public function archive(Request $request, Paiement $paiement)
    {
        abort_unless($request->user()->hasPermission('paiements', 'archive'), 403);

        return $this->changerStatut($paiement, 'archive');
    }

    public function corbeille(Request $request, Paiement $paiement)
    {
        abort_unless($request->user()->hasPermission('paiements', 'corbeille'), 403);

        return $this->changerStatut($paiement, 'corbeille');
    }

    public function restore(Request $request, Paiement $paiement)
    {
        abort_unless($request->user()->hasPermission('paiements', 'archive'), 403);

        return $this->changerStatut($paiement, 'actif');
    }

    public function destroy(Request $request, Paiement $paiement)
    {
        abort_unless($request->user()->hasPermission('paiements', 'supprimer'), 403);

        if ($paiement->status !== 'corbeille') {
            return response()->json([
                'message' => 'Seul un paiement déjà placé dans la Corbeille peut être supprimé définitivement.',
            ], 422);
        }

        DB::transaction(function () use ($paiement) {
            $documentId = $paiement->document_id;

            if ($paiement->piece_jointe_chemin) {
                Storage::disk('public')->delete($paiement->piece_jointe_chemin);
            }

            $paiement->delete();
            Paiement::synchroniserFacture($documentId);
        });

        return response()->json(['message' => 'Paiement supprimé définitivement.']);
    }

    /** Factures rattachables : sert à alimenter le sélecteur du formulaire. */
    public function facturesDisponibles(Request $request)
    {
        abort_unless($request->user()->hasPermission('paiements', 'ajouter_paiement'), 403);

        return $this->factures->lister();
    }
}
