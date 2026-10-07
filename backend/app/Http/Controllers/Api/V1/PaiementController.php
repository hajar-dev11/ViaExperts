<?php

namespace App\Http\Controllers\Api\V1;

use App\Modules\Facturation\Contracts\FactureExiste;
use App\Modules\Facturation\Contracts\FactureReference;
use App\Modules\Facturation\Contracts\MontantFacture;
use App\Modules\Facturation\Contracts\FacturesDisponibles;
use App\Contracts\ServicesEnCours\AssureServicesEnCours;
use App\Http\Controllers\Controller;
use App\Http\Resources\PaiementResource;
use App\Models\Paiement;
use App\Rules\FichierAutorise;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class PaiementController extends Controller
{
    private const RELATIONS = ['lignes.service', 'client', 'entreprise'];

    public function __construct(
        private FacturesDisponibles $factures,
        private AssureServicesEnCours $servicesEnCours,
        private FactureExiste $factureExiste,
        private MontantFacture $montantFacture,
        private FactureReference $factureReference,
    ) {
    }

    /** Montant au format français pour les messages d'erreur : « 7 200,00 Dh ». */
    private function dh(float $montant): string
    {
        return number_format($montant, 2, ',', ' ').' Dh';
    }

    /**
     * Refuse le surpaiement côté serveur (HTTP 422, champ `prix_paye`, message en français) : à appeler SOUS le verrou
     * de création/modification, avant toute écriture, pour que deux paiements simultanés ne dépassent jamais ensemble le
     * reste à payer.
     *
     *  - le montant payé ne peut pas dépasser le total des lignes du paiement (`$verifierTotal`) ;
     *  - s'il est rattaché à une facture : il ne peut pas dépasser le reste à payer de celle-ci
     *    (total TTC − paiements ACTIFS déjà enregistrés, hors `$paiementId` lui-même).
     */
    private function refuserSurpaiement(float $prixPaye, float $totalLignes, ?int $documentId, ?int $paiementId, bool $verifierTotal = true): void
    {
        $tolerance = 0.005;

        if ($verifierTotal && $prixPaye > $totalLignes + $tolerance) {
            throw ValidationException::withMessages(['prix_paye' => [sprintf(
                'Le montant payé (%s) dépasse le total du paiement (%s). Le paiement n\'a pas été enregistré.',
                $this->dh($prixPaye),
                $this->dh($totalLignes)
            )]]);
        }

        if (! $documentId) {
            return;
        }

        $totalFacture = $this->montantFacture->totalTtc($documentId);

        if ($totalFacture === null) {
            return;
        }

        $dejaPaye = (float) Paiement::where('document_id', $documentId)
            ->where('status', 'actif')
            ->when($paiementId, fn ($q) => $q->where('id', '!=', $paiementId))
            ->sum('prix_paye');
        $reste = round($totalFacture - $dejaPaye, 2);

        if ($prixPaye > $reste + $tolerance) {
            $numero = $this->factureReference->numeros([$documentId])[$documentId] ?? "#{$documentId}";

            throw ValidationException::withMessages(['prix_paye' => [sprintf(
                'Le montant payé (%s) dépasse le reste à payer de la facture n° %s (%s). Le paiement n\'a pas été enregistré.',
                $this->dh($prixPaye),
                $numero,
                $this->dh(max(0.0, $reste))
            )]]);
        }
    }

    /** Total des lignes saisies : même calcul que `Paiement::recalculerTotal()`. */
    private function totalDesLignes(array $lignes): float
    {
        return round(array_reduce($lignes, fn (float $total, array $l) => $total + (float) $l['quantite'] * (float) $l['prix_unitaire'], 0.0), 2);
    }

    /**
     * Exécute `$operation` en exclusion mutuelle avec les autres créations de paiement (verrou nommé MySQL, partagé
     * entre processus). La référence `#N` dérive du dernier identifiant et la facture est resynchronisée dans la même
     * transaction : sans ce verrou, des paiements enregistrés au même instant se heurtent (référence en double,
     * interblocages) et répondent HTTP 500. La section critique est courte ; le verrou est toujours relâché.
     */
    private function enExclusionMutuelle(Closure $operation): mixed
    {
        $verrou = 'via_experts.paiements.creation';

        if ((int) (DB::selectOne('SELECT GET_LOCK(?, 20) AS ok', [$verrou])->ok ?? 0) !== 1) {
            abort(503, 'Le serveur est occupé, veuillez réessayer dans un instant.');
        }

        try {
            return $operation();
        } finally {
            DB::select('SELECT RELEASE_LOCK(?)', [$verrou]);
        }
    }
    private function regles(bool $partiel = false): array
    {
        $r = $partiel ? 'sometimes' : 'required';

        return [
            'emetteur' => [$r, 'in:via_experts,bureau_comptabilite'],
            'responsable' => ['nullable', 'string', 'max:150'],
            'party_id' => [$r, 'integer', 'exists:parties,id'],
            'document_id' => ['bail', 'nullable', 'integer', function (string $attribute, mixed $value, Closure $fail) {
                // Validation via le contrat public de Facturation (plus de lien direct avec la table des documents) :
                // mêmes règles que l'ancienne règle Laravel `exists` - même message, évaluée avant toute écriture, et
                // un document en corbeille reste accepté. "bail" reproduit le fait que `exists` n'était pas évaluée
                // après l'échec de `integer` (un seul message d'erreur dans ce cas).
                if (! $this->factureExiste->existe((int) $value)) {
                    $fail(__('validation.exists'));
                }
            }],
            'date_operation' => [$r, 'date'],
            'date_credit' => ['nullable', 'date'],
            'mode_paiement' => ['nullable', 'string', 'max:40'],
            'signature' => ['nullable', 'boolean'],
            'observation' => ['nullable', 'string', 'max:5000'],
            'prix_paye' => ['nullable', 'numeric', 'min:0'],
            'piece_jointe' => ['nullable', 'file', FichierAutorise::document(), 'max:5120'],

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

        $data['created_by'] = $request->user()->id;

        // Stockée avant la section critique pour qu'elle reste la plus courte possible.
        if ($request->hasFile('piece_jointe')) {
            $file = $request->file('piece_jointe');
            $data['piece_jointe_chemin'] = $file->store('paiements', 'public');
            $data['piece_jointe_nom'] = $file->getClientOriginalName();
        }

        $paiement = $this->enExclusionMutuelle(fn () => DB::transaction(function () use ($request, $data, $lignes) {
            // Surpaiement refusé AVANT toute écriture (sous le verrou : le reste à payer est celui de cet instant).
            $this->refuserSurpaiement((float) ($data['prix_paye'] ?? 0), $this->totalDesLignes($lignes), $data['document_id'] ?? null, null);

            // Référence calculée sous verrou (voir enExclusionMutuelle).
            $data['reference'] = Paiement::prochaineReference();

            $paiement = Paiement::create($data);

            foreach (array_values($lignes) as $ordre => $ligne) {
                $paiement->lignes()->create($ligne + ['ordre' => $ordre]);
            }

            $paiement->load('lignes');
            $paiement->recalculerTotal();

            // Les services saisis sur les lignes apparaissent dans « Services en cours ».
            $this->servicesEnCours->assurerPourTiers($paiement->party_id, $paiement->lignes->pluck('service_id'), $request->user()->id);

            // Option C : la facture rattachée est resynchronisée dans la même transaction.
            Paiement::synchroniserFacture($paiement->document_id);

            return $paiement;
        }));

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

        $this->enExclusionMutuelle(fn () => DB::transaction(function () use ($request, $paiement, $data, $lignes, $ancienDocument) {
            $this->verifierModification($paiement, $data, $lignes);

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
            $this->servicesEnCours->assurerPourTiers($paiement->party_id, $paiement->lignes->pluck('service_id'), $request->user()->id);

            // Resynchroniser l'ancienne facture si le rattachement a changé.
            Paiement::synchroniserFacture($ancienDocument);
            Paiement::synchroniserFacture($paiement->document_id);
        }));

        return new PaiementResource($paiement->fresh(self::RELATIONS));
    }

    /**
     * Surpaiement à la modification. Un paiement ancien qui dépasse déjà (données antérieures à cette règle) reste
     * modifiable tant qu'on n'AGGRAVE pas la situation (montant payé en hausse, total en baisse, autre facture) :
     * on ne bloque pas la correction d'une simple observation.
     */
    private function verifierModification(Paiement $paiement, array $data, ?array $lignes): void
    {
        $prixPaye = array_key_exists('prix_paye', $data) ? (float) ($data['prix_paye'] ?? 0) : (float) $paiement->prix_paye;
        $total = $lignes !== null ? $this->totalDesLignes($lignes) : (float) $paiement->total;
        $documentId = array_key_exists('document_id', $data) ? ($data['document_id'] ?: null) : $paiement->document_id;
        $statut = $data['status'] ?? $paiement->status;

        $aggrave = $prixPaye > (float) $paiement->prix_paye + 0.005
            || $total < (float) $paiement->total - 0.005
            || (int) $documentId !== (int) $paiement->document_id;

        if ($aggrave && $statut === 'actif') {
            $this->refuserSurpaiement($prixPaye, $total, $documentId, $paiement->id);
        }
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

        // Remettre un paiement en vigueur ne doit pas non plus faire dépasser le reste à payer de sa facture.
        return $this->enExclusionMutuelle(function () use ($paiement) {
            $this->refuserSurpaiement((float) $paiement->prix_paye, (float) $paiement->total, $paiement->document_id, $paiement->id, false);

            return $this->changerStatut($paiement, 'actif');
        });
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
