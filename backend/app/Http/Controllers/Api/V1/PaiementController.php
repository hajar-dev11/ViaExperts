<?php

namespace App\Http\Controllers\Api\V1;

use App\Modules\Facturation\Contracts\FactureExiste;
use App\Modules\Facturation\Contracts\FactureReference;
use App\Modules\Facturation\Contracts\InformationsFacture;
use App\Modules\Facturation\Contracts\MontantFacture;
use App\Modules\Facturation\Contracts\FacturesDisponibles;
use App\Contracts\ServicesEnCours\AssureServicesEnCours;
use App\Http\Controllers\Controller;
use App\Http\Resources\PaiementResource;
use App\Models\Paiement;
use App\Rules\FichierAutorise;
use App\Support\VerrouPaiements;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class PaiementController extends Controller
{
    private const RELATIONS = ['lignes.service', 'client', 'entreprise'];

    /** Types de documents qui peuvent recevoir un paiement : seules les factures se règlent. */
    private const TYPES_PAYABLES = ['facture'];

    public function __construct(
        private FacturesDisponibles $factures,
        private AssureServicesEnCours $servicesEnCours,
        private FactureExiste $factureExiste,
        private MontantFacture $montantFacture,
        private FactureReference $factureReference,
        private InformationsFacture $informationsFacture,
    ) {
    }

    /**
     * Le document rattaché doit être une FACTURE du MÊME client que le paiement (HTTP 422, champ `document_id`).
     * À appeler SOUS le verrou, avant toute écriture : le client d'une facture peut être modifié pendant ce temps.
     * L'existence du document est validée avant (règle `document_id`) ; sans document, rien à vérifier.
     */
    private function verifierRattachement(?int $documentId, int $partyId): void
    {
        if (! $documentId) {
            return;
        }

        $document = $this->informationsFacture->typeEtTiers($documentId);

        if ($document === null) {
            return; // inexistant : déjà refusé par la validation du champ
        }

        if (! in_array($document['type'], self::TYPES_PAYABLES, true)) {
            throw ValidationException::withMessages(['document_id' => [
                'Ce document ne peut pas recevoir de paiement : seules les factures peuvent être réglées.',
            ]]);
        }

        if ($document['party_id'] !== $partyId) {
            throw ValidationException::withMessages(['document_id' => [
                'Cette facture appartient à un autre client : le paiement doit être rattaché à une facture du même client.',
            ]]);
        }
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
     *  - s'il est rattaché à une facture : il ne peut pas dépasser le reste à payer de celle-ci, soit le total TTC moins
     *    ce qui est déjà payé : les paiements ACTIFS enregistrés (hors `$paiementId` lui-même) ET le montant « payé »
     *    saisi à la main sur la facture sans paiement correspondant (Paiement::partManuelle).
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
            ->sum('prix_paye') + Paiement::partManuelle($documentId);
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
        // Le même verrou protège la modification d'une facture (module Facturation).
        return VerrouPaiements::executer($operation);
    }

    private const MESSAGES = [
        'lignes.required' => 'Ajoutez au moins un service au paiement.',
        'lignes.min' => 'Ajoutez au moins un service au paiement.',
        'lignes.*.quantite.integer' => 'La quantité doit être un nombre entier (sans virgule).',
    ];

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
            'lignes.*.quantite' => ['required_with:lignes', 'integer', 'min:0'],
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
        Paiement::chargerRestes($paiements);

        return PaiementResource::collection($paiements);
    }

    /**
     * Vue « Gestion des Paiements » : une ligne par service d'un paiement d'ORIGINE, avec les montants du DOSSIER : le montant
     * payé et le reste tiennent compte de TOUS les paiements enregistrés pour ce service (paiement d'origine + compléments),
     * pas seulement du dernier. Les compléments n'ont pas de ligne propre : ils se consultent dans l'historique (œil).
     * Le filtre `regle` reprend le second sélecteur de la capture.
     */
    public function gestion(Request $request)
    {
        abort_unless($request->user()->hasPermission('paiements', 'gestion_paiements'), 403);

        $statut = $request->query('status', 'actif');

        $complements = Paiement::complementsDisponibles();

        $paiements = Paiement::with(self::RELATIONS)
            ->when($complements, fn ($q) => $q->whereNull('paiement_origine_id'))
            ->status($statut)
            ->orderByDesc('id')
            ->get();

        // Total payé et nombre de paiements par dossier, au statut affiché : une seule requête pour toute la liste.
        // (Sans la migration des compléments, chaque paiement est son propre dossier : calcul historique.)
        $dossiers = ! $complements ? collect() : Paiement::query()
            ->selectRaw('COALESCE(paiement_origine_id, id) as racine, SUM(prix_paye) as paye, COUNT(*) as nb')
            ->where('status', $statut)
            ->whereIn(DB::raw('COALESCE(paiement_origine_id, id)'), $paiements->pluck('id')->all())
            ->groupBy(DB::raw('COALESCE(paiement_origine_id, id)'))
            ->get()
            ->keyBy('racine');

        $aujourdhui = now()->startOfDay();

        $lignes = $paiements->flatMap(function ($p) use ($dossiers, $complements, $statut, $aujourdhui) {
            $paye = round((float) ($dossiers[$p->id]->paye ?? $p->prix_paye), 2);
            $restant = round((float) $p->total - $paye, 2);
            $nombre = (int) ($dossiers[$p->id]->nb ?? 1);

            // Échéance dépassée : la « Date Crédit » du dossier (seule date limite de règlement que porte un paiement) est passée
            // (strictement : le jour même n'est pas en retard) ET il reste quelque chose à payer. Jamais pour un dossier soldé.
            $enRetard = $statut === 'actif' && $p->date_credit !== null && $p->date_credit->lt($aujourdhui) && $restant > 0;

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
                'prixPaye' => number_format($paye, 2, '.', ''),
                'prixRestant' => number_format($restant, 2, '.', ''),
                'nbPaiements' => $nombre,
                // Faux tant que la migration des paiements complémentaires n'est pas appliquée : l'action « Ajouter un paiement » se masque.
                'complementsPossibles' => $complements,
                'dateOperation' => optional($p->date_operation)->toDateString(),
                'dateCredit' => optional($p->date_credit)->toDateString(),
                // Soldé seulement quand le total des paiements couvre le montant dû : jamais d'après le dernier paiement seul.
                'regle' => $restant <= 0,
                'enRetard' => $enRetard,
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

        $paiement->load(self::RELATIONS);
        Paiement::chargerRestes([$paiement]);
        $this->donnerLesServicesDuDossier(collect([$paiement]));

        return new PaiementResource($paiement);
    }

    /** Un complément n'a pas de lignes propres : il affiche les services du paiement d'origine (lecture seule). */
    private function donnerLesServicesDuDossier($paiements): void
    {
        $complements = $paiements->filter(fn ($p) => $p->estComplement());
        if ($complements->isEmpty()) {
            return;
        }

        $origines = Paiement::with('lignes.service')->whereIn('id', $complements->pluck('paiement_origine_id')->unique())->get()->keyBy('id');
        foreach ($complements as $complement) {
            $complement->setRelation('lignes', $origines[$complement->paiement_origine_id]->lignes ?? collect());
        }
    }

    /**
     * Historique complet d'un service : TOUS les paiements du dossier (paiement d'origine + compléments), une ligne par
     * paiement, du plus ancien au plus récent. Chaque ligne porte son propre reste cumulé et son propre reçu.
     */
    public function historique(Request $request, Paiement $paiement)
    {
        abort_unless($this->peutConsulter($request), 403);

        $racineId = $paiement->racineId();
        $racine = $paiement->estComplement() ? Paiement::find($racineId) : $paiement;
        abort_if($racine === null, 404);

        $paiements = Paiement::with(self::RELATIONS)
            ->where(fn ($q) => Paiement::complementsDisponibles()
                ? $q->where('id', $racineId)->orWhere('paiement_origine_id', $racineId)
                : $q->where('id', $racineId))
            ->status($racine->status)
            ->orderBy('id')
            ->get();

        // Seuls les paiements réellement encaissés figurent dans l'historique : un dossier créé sans aucun versement
        // (montant payé = 0) n'a pas de ligne de paiement. Le reste cumulé est calculé AVANT ce filtre.
        Paiement::chargerNumerosFactures($paiements);
        Paiement::chargerRestes($paiements);
        $paiements = $paiements->filter(fn ($p) => (float) $p->prix_paye > 0)->values();
        $this->donnerLesServicesDuDossier($paiements);

        return PaiementResource::collection($paiements);
    }

    /** Consulter les paiements : liste OU gestion (l'œil de la gestion ouvre l'historique). */
    private function peutConsulter(Request $request): bool
    {
        $utilisateur = $request->user();

        return $utilisateur->hasPermission('paiements', 'list_paiements') || $utilisateur->hasPermission('paiements', 'gestion_paiements');
    }

    /**
     * Télécharge la pièce jointe d'UN paiement, uniquement pour un utilisateur autorisé : le fichier est servi par l'API
     * (jamais par un lien public) et l'identifiant du paiement fixe le fichier — on ne peut pas atteindre celui d'un autre.
     */
    public function fichier(Request $request, Paiement $paiement)
    {
        abort_unless($this->peutConsulter($request), 403);
        abort_unless($paiement->piece_jointe_chemin && Storage::disk('public')->exists($paiement->piece_jointe_chemin), 404);

        return Storage::disk('public')->download($paiement->piece_jointe_chemin, $paiement->piece_jointe_nom ?: basename($paiement->piece_jointe_chemin));
    }

    /**
     * Paiement COMPLÉMENTAIRE : encaisse une partie (ou la totalité) du reste à payer d'un service déjà payé en partie.
     * Il s'ajoute au dossier du paiement d'origine — même client, même service, même facture éventuelle — sans créer de
     * nouveau service, sans toucher aux paiements précédents (montants, reçus, fichiers, observations).
     * Le montant est contrôlé côté serveur, sous le verrou des paiements : il ne dépasse jamais le reste dû.
     */
    public function ajouterComplement(Request $request, Paiement $paiement)
    {
        abort_unless($request->user()->hasPermission('paiements', 'ajouter_paiement'), 403);

        if (! Paiement::complementsDisponibles()) {
            return response()->json([
                'message' => 'Les paiements complémentaires nécessitent une mise à jour de la base de données (migration du 15/10/2026 non appliquée).',
            ], 503);
        }

        $data = $request->validate([
            'prix_paye' => ['required', 'numeric', 'min:0.01'],
            'date_operation' => ['required', 'date'],
            'mode_paiement' => ['nullable', 'string', 'max:40'],
            'signature' => ['nullable', 'boolean'],
            'observation' => ['nullable', 'string', 'max:5000'],
            'piece_jointe' => ['nullable', 'file', FichierAutorise::document(), 'max:5120'],
        ], [
            'prix_paye.required' => 'Saisissez le montant payé.',
            'prix_paye.min' => 'Le montant payé doit être supérieur à 0.',
        ]);
        unset($data['piece_jointe']);

        $chemin = null;
        if ($request->hasFile('piece_jointe')) {
            $file = $request->file('piece_jointe');
            $chemin = $file->store('paiements', 'public');
            $data['piece_jointe_chemin'] = $chemin;
            $data['piece_jointe_nom'] = $file->getClientOriginalName();
        }

        try {
            $complement = $this->enExclusionMutuelle(fn () => DB::transaction(function () use ($request, $paiement, $data) {
                // Le paiement visé peut lui-même être un complément : on rattache toujours au paiement d'ORIGINE du dossier.
                $racine = Paiement::findOrFail($paiement->racineId());

                if ($racine->status !== 'actif') {
                    throw ValidationException::withMessages(['prix_paye' => [
                        'Ce paiement n\'est pas actif : il ne peut pas recevoir de paiement complémentaire.',
                    ]]);
                }

                $total = round((float) $racine->total, 2);
                $reste = round($total - Paiement::cumulPaye($racine->id), 2);
                $prix = round((float) $data['prix_paye'], 2);

                if ($reste <= 0) {
                    throw ValidationException::withMessages(['prix_paye' => ['Ce service est déjà soldé : il n\'y a plus rien à payer.']]);
                }

                if ($prix > $reste + 0.005) {
                    throw ValidationException::withMessages(['prix_paye' => [sprintf(
                        'Le montant payé (%s) dépasse le reste à payer (%s). Le paiement n\'a pas été enregistré.',
                        $this->dh($prix),
                        $this->dh($reste)
                    )]]);
                }

                // Si le paiement est rattaché à une facture : son propre reste à payer s'applique aussi.
                $this->refuserSurpaiement($prix, $total, $racine->document_id, null, false);

                $partManuelle = Paiement::partManuelle($racine->document_id);

                $complement = Paiement::create(array_merge($data, [
                    'reference' => Paiement::prochaineReference(),
                    'emetteur' => $racine->emetteur,
                    'responsable' => $racine->responsable,
                    'party_id' => $racine->party_id,
                    'document_id' => $racine->document_id,
                    'paiement_origine_id' => $racine->id,
                    'total' => $racine->total,
                    'prix_paye' => $prix,
                    'status' => 'actif',
                    'created_by' => $request->user()->id,
                ]));

                Paiement::synchroniserFacture($complement->document_id, $partManuelle);

                return $complement;
            }));
        } catch (\Throwable $e) {
            // Rien n'est enregistré : le fichier déjà stocké ne doit pas rester orphelin.
            if ($chemin) {
                Storage::disk('public')->delete($chemin);
            }

            throw $e;
        }

        $complement = $complement->fresh(self::RELATIONS);
        Paiement::chargerRestes([$complement]);
        $this->donnerLesServicesDuDossier(collect([$complement]));

        return (new PaiementResource($complement))->response()->setStatusCode(201);
    }

    public function store(Request $request)
    {
        abort_unless($request->user()->hasPermission('paiements', 'ajouter_paiement'), 403);

        $data = $request->validate($this->regles(), self::MESSAGES);
        $lignes = $data['lignes'];
        unset($data['lignes'], $data['piece_jointe']);

        // Prix unitaires et total d'un paiement gardent leurs centimes (aucun arrondi).

        $data['created_by'] = $request->user()->id;

        // Stockée avant la section critique pour qu'elle reste la plus courte possible.
        if ($request->hasFile('piece_jointe')) {
            $file = $request->file('piece_jointe');
            $data['piece_jointe_chemin'] = $file->store('paiements', 'public');
            $data['piece_jointe_nom'] = $file->getClientOriginalName();
        }

        $paiement = $this->enExclusionMutuelle(fn () => DB::transaction(function () use ($request, $data, $lignes) {
            // Facture du bon client, de type payable : refusé AVANT toute écriture.
            $this->verifierRattachement($data['document_id'] ?? null, (int) $data['party_id']);

            // Surpaiement refusé AVANT toute écriture (sous le verrou : le reste à payer est celui de cet instant).
            $this->refuserSurpaiement((float) ($data['prix_paye'] ?? 0), $this->totalDesLignes($lignes), $data['document_id'] ?? null, null);

            // Montant « payé » saisi à la main sur la facture : conservé par la resynchronisation (lu AVANT toute écriture).
            $partManuelle = Paiement::partManuelle($data['document_id'] ?? null);

            // Référence calculée sous verrou (voir enExclusionMutuelle).
            $data['reference'] = Paiement::prochaineReference();

            $paiement = Paiement::create($data);

            foreach (array_values($lignes) as $ordre => $ligne) {
                $paiement->lignes()->create($ligne + ['ordre' => $ordre]);
            }

            $paiement->load('lignes');
            $paiement->recalculerTotal();

            // Les services saisis sur les lignes apparaissent dans « Services en cours ».
            $this->servicesEnCours->assurerPourTiers($paiement->party_id, $paiement->lignes->pluck('service_id'), $request->user()->id, [
                'type' => 'paiement', 'id' => $paiement->id,
                // La pièce jointe du paiement est seulement RÉFÉRENCÉE par l'activité du service (jamais copiée ni supprimée avec lui).
                'fichier_nom' => $paiement->piece_jointe_nom, 'fichier_chemin' => $paiement->piece_jointe_chemin,
            ]);

            // Option C : la facture rattachée est resynchronisée dans la même transaction.
            Paiement::synchroniserFacture($paiement->document_id, $partManuelle);

            return $paiement;
        }));

        return (new PaiementResource($paiement->fresh(self::RELATIONS)))
            ->response()
            ->setStatusCode(201);
    }

    public function update(Request $request, Paiement $paiement)
    {
        abort_unless($request->user()->hasPermission('paiements', 'ajouter_paiement'), 403);

        $data = $request->validate($this->regles(true), self::MESSAGES);
        $lignes = $data['lignes'] ?? null;
        // Prix unitaires et total d'un paiement gardent leurs centimes (aucun arrondi).
        unset($data['lignes'], $data['piece_jointe']);

        // Un complément reste attaché au dossier de son paiement d'origine : ni client, ni facture, ni services propres.
        $estComplement = $paiement->estComplement();
        if ($estComplement) {
            unset($data['party_id'], $data['document_id'], $data['emetteur'], $data['responsable']);
            $lignes = null;
        }

        $ancienDocument = $paiement->document_id;

        $this->enExclusionMutuelle(fn () => DB::transaction(function () use ($request, $paiement, $data, $lignes, $ancienDocument, $estComplement) {
            // Le rattachement (facture + client) est revérifié dès que l'un des deux CHANGE (un paiement ancien dont le
            // rattachement ne bouge pas reste modifiable : on ne bloque pas la correction d'une simple observation).
            $documentApres = array_key_exists('document_id', $data) ? ($data['document_id'] ?: null) : $paiement->document_id;
            $tiersApres = (int) ($data['party_id'] ?? $paiement->party_id);
            if ((int) $documentApres !== (int) $paiement->document_id || $tiersApres !== (int) $paiement->party_id) {
                $this->verifierRattachement($documentApres, $tiersApres);
            }

            $this->verifierModification($paiement, $data, $lignes);

            // Parts saisies à la main (ancienne et nouvelle facture), lues AVANT toute écriture.
            $nouveauDocument = array_key_exists('document_id', $data) ? ($data['document_id'] ?: null) : $ancienDocument;
            $partAncienne = Paiement::partManuelle($ancienDocument);
            $partNouvelle = (int) $nouveauDocument === (int) $ancienDocument ? $partAncienne : Paiement::partManuelle($nouveauDocument);

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

            if (! $estComplement) {
                $paiement->load('lignes');
                $paiement->recalculerTotal();

                // Le total du dossier a pu changer : les compléments le reprennent (leur propre montant payé ne bouge pas).
                if (Paiement::complementsDisponibles()) {
                    $paiement->complements()->update(['total' => $paiement->total]);
                }

                // Un service ajouté lors d'une modification apparaît lui aussi dans « Services en cours ».
                $this->servicesEnCours->assurerPourTiers($paiement->party_id, $paiement->lignes->pluck('service_id'), $request->user()->id, [
                    'type' => 'paiement', 'id' => $paiement->id,
                    // La pièce jointe du paiement est seulement RÉFÉRENCÉE par l'activité du service (jamais copiée ni supprimée avec lui).
                    'fichier_nom' => $paiement->piece_jointe_nom, 'fichier_chemin' => $paiement->piece_jointe_chemin,
                ]);
            }

            // Resynchroniser l'ancienne facture si le rattachement a changé.
            Paiement::synchroniserFacture($ancienDocument, $partAncienne);
            if ((int) $paiement->document_id !== (int) $ancienDocument) {
                Paiement::synchroniserFacture($paiement->document_id, $partNouvelle);
            }
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
            $this->refuserDepassementDossier($paiement->racineId(), $prixPaye, $paiement->id, $total);
        }
    }

    /**
     * Le total payé sur un dossier (paiement d'origine + compléments actifs) ne dépasse jamais le montant dû du service.
     * `$sauf` : le paiement modifié ou restauré (son ancien montant ne compte pas). Sans complément, c'est la règle habituelle
     * « le montant payé ne dépasse pas le total du paiement ».
     */
    private function refuserDepassementDossier(int $racineId, float $prixPaye, ?int $sauf, float $totalDossier): void
    {
        $reste = round($totalDossier - Paiement::cumulPaye($racineId, 'actif', $sauf), 2);

        if ($prixPaye > $reste + 0.005) {
            throw ValidationException::withMessages(['prix_paye' => [sprintf(
                'Le montant payé (%s) dépasse le reste à payer du service (%s). Le paiement n\'a pas été enregistré.',
                $this->dh($prixPaye),
                $this->dh(max(0.0, $reste))
            )]]);
        }
    }

    private function changerStatut(Paiement $paiement, string $status): PaiementResource
    {
        DB::transaction(function () use ($paiement, $status) {
            $partManuelle = Paiement::partManuelle($paiement->document_id); // lue AVANT le changement de statut
            $avant = $paiement->status;
            $paiement->update(['status' => $status]);

            // Le dossier suit son paiement d'origine : ses compléments qui avaient le même statut le prennent aussi (un
            // complément déjà archivé ou à la corbeille à part n'est pas ressuscité par une restauration).
            if (Paiement::complementsDisponibles() && ! $paiement->estComplement()) {
                $paiement->complements()->where('status', $avant)->update(['status' => $status]);
            }

            Paiement::synchroniserFacture($paiement->document_id, $partManuelle);
        });

        $paiement = $paiement->fresh(self::RELATIONS);
        Paiement::chargerRestes([$paiement]);

        return new PaiementResource($paiement);
    }

    public function archive(Request $request, Paiement $paiement)
    {
        abort_unless($request->user()->hasPermission('paiements', 'archive'), 403);

        return $this->enExclusionMutuelle(fn () => $this->changerStatut($paiement, 'archive'));
    }

    public function corbeille(Request $request, Paiement $paiement)
    {
        abort_unless($request->user()->hasPermission('paiements', 'corbeille'), 403);

        return $this->enExclusionMutuelle(fn () => $this->changerStatut($paiement, 'corbeille'));
    }

    public function restore(Request $request, Paiement $paiement)
    {
        abort_unless($request->user()->hasPermission('paiements', 'archive'), 403);

        // Remettre un paiement en vigueur ne doit pas non plus faire dépasser le reste à payer de sa facture.
        return $this->enExclusionMutuelle(function () use ($paiement) {
            $this->refuserSurpaiement((float) $paiement->prix_paye, (float) $paiement->total, $paiement->document_id, $paiement->id, false);

            // Un complément ne se remet en vigueur que si son paiement d'origine l'est, et sans dépasser le reste dû du service.
            if ($paiement->estComplement()) {
                $racine = Paiement::find($paiement->paiement_origine_id);

                if ($racine === null || $racine->status !== 'actif') {
                    throw ValidationException::withMessages(['prix_paye' => [
                        'Restaurez d\'abord le paiement d\'origine : ce paiement complémentaire en dépend.',
                    ]]);
                }

                $this->refuserDepassementDossier($racine->id, (float) $paiement->prix_paye, $paiement->id, (float) $racine->total);
            }

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

        $this->enExclusionMutuelle(fn () => DB::transaction(function () use ($paiement) {
            $documentId = $paiement->document_id;
            $partManuelle = Paiement::partManuelle($documentId);

            // Supprimer un paiement d'origine supprime aussi son dossier : ses compléments et leurs fichiers.
            if (Paiement::complementsDisponibles() && ! $paiement->estComplement()) {
                foreach ($paiement->complements()->get() as $complement) {
                    if ($complement->piece_jointe_chemin) {
                        Storage::disk('public')->delete($complement->piece_jointe_chemin);
                    }
                    $complement->delete();
                }
            }

            if ($paiement->piece_jointe_chemin) {
                Storage::disk('public')->delete($paiement->piece_jointe_chemin);
            }

            $paiement->delete();
            Paiement::synchroniserFacture($documentId, $partManuelle);
        }));

        return response()->json(['message' => 'Paiement supprimé définitivement.']);
    }

    /** Factures rattachables : sert à alimenter le sélecteur du formulaire. */
    public function facturesDisponibles(Request $request)
    {
        abort_unless($request->user()->hasPermission('paiements', 'ajouter_paiement'), 403);

        return $this->factures->lister();
    }
}
