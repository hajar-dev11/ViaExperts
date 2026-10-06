<?php

namespace App\Modules\Domiciliation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Domiciliation\Http\Requests\StoreDomiciliationRequest;
use App\Modules\Domiciliation\Http\Requests\UpdateDomiciliationRequest;
use App\Modules\Domiciliation\Http\Resources\DomiciliationResource;
use App\Modules\Domiciliation\Models\Domiciliation;
use App\Modules\Domiciliation\Models\DomiciliationDocument;
use App\Modules\Domiciliation\Models\DomiciliationObservation;
use App\Modules\Domiciliation\Models\DomiciliationOperation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class DomiciliationController extends Controller
{
    // `auteur` alimente la colonne « Ajouter par » de la fiche entreprise.
    // `operations` porte le journal Renouveler / Déclarer / Résilier.
    private const RELATIONS = [
        'entreprise.client', 'centre', 'observations.auteur', 'documents.auteur', 'auteur', 'operations.auteur',
    ];

    /**
     * Enregistre une action métier (renouvellement / déclaration / résiliation)
     * avec son commentaire et son fichier éventuels.
     *
     * Les trois actions partagent ce chemin : un seul endroit à corriger si la
     * façon de stocker les pièces jointes change.
     */
    private function journaliser(Request $request, Domiciliation $domiciliation, string $type): void
    {
        $file = $request->file('fichier');

        DomiciliationOperation::create([
            'domiciliation_id' => $domiciliation->id,
            'type' => $type,
            'commentaire' => $request->input('commentaire') ?: null,
            'fichier_nom' => $file?->getClientOriginalName(),
            'fichier_chemin' => $file?->store('domiciliations/operations', 'public'),
            'created_by' => $request->user()->id,
        ]);
    }

    public function index(Request $request)
    {
        $query = Domiciliation::with(self::RELATIONS)
            ->status($request->query('status', 'actif'))
            ->orderByDesc('id');

        // Historique complet des périodes d'une même entreprise (fiche
        // « Informations Domiciliation » — tableau « Domiciliation »).
        if ($entrepriseId = $request->query('entreprise_id')) {
            $query->where('entreprise_id', $entrepriseId);
        }

        $domiciliations = $query->get();

        // Filtre sur le statut d'affichage (active / alerte / declare / expire / resilie),
        // calculé à partir de date_fin : il n'est pas stocké, donc pas filtrable en SQL.
        if ($statut = $request->query('statut')) {
            $domiciliations = $domiciliations->filter(
                fn ($d) => $d->statut_affichage === $statut
            )->values();
        }

        return DomiciliationResource::collection($domiciliations);
    }

    public function store(StoreDomiciliationRequest $request)
    {
        $data = $request->validated();
        $data['created_by'] = $request->user()->id;

        $domiciliation = Domiciliation::create($data);

        // `etat` et `status` ont des valeurs par défaut posées par la base :
        // sans refresh, la réponse les renverrait à null.
        $domiciliation->refresh();

        return new DomiciliationResource($domiciliation->load(self::RELATIONS));
    }

    public function show(Domiciliation $domiciliation)
    {
        return new DomiciliationResource($domiciliation->load(self::RELATIONS));
    }

    public function update(UpdateDomiciliationRequest $request, Domiciliation $domiciliation)
    {
        $domiciliation->update($request->validated());

        return new DomiciliationResource($domiciliation->load(self::RELATIONS));
    }

    public function archive(Domiciliation $domiciliation)
    {
        $domiciliation->update(['status' => 'archive']);

        return new DomiciliationResource($domiciliation->load(self::RELATIONS));
    }

    public function corbeille(Domiciliation $domiciliation)
    {
        $domiciliation->update(['status' => 'corbeille']);

        return new DomiciliationResource($domiciliation->load(self::RELATIONS));
    }

    public function restore(Domiciliation $domiciliation)
    {
        $domiciliation->update(['status' => 'actif']);

        return new DomiciliationResource($domiciliation->load(self::RELATIONS));
    }

    public function destroy(Domiciliation $domiciliation)
    {
        if ($domiciliation->status !== 'corbeille') {
            return response()->json([
                'message' => 'Seule une domiciliation déjà placée dans la Corbeille peut être supprimée définitivement.',
            ], 422);
        }

        $domiciliation->delete();

        return response()->json(['message' => 'Domiciliation supprimée définitivement.']);
    }

    /**
     * Action « Renouveler » : crée une NOUVELLE période pour la même entreprise
     * et le même centre, rattachée à celle qu'elle prolonge.
     *
     * La domiciliation d'origine n'est pas modifiée — son historique reste
     * consultable — mais elle porte l'opération de renouvellement dans son
     * journal, ce qui permet d'y joindre un justificatif.
     */
    public function renouveler(Request $request, Domiciliation $domiciliation)
    {
        $data = $request->validate([
            'date_depart' => ['required', 'date'],
            'date_fin' => ['nullable', 'date', 'after_or_equal:date_depart'],
            'mois_payee' => ['nullable', 'integer', 'min:0', 'max:600'],
            'mois_gratuits' => ['nullable', 'integer', 'min:0', 'max:600'],
            'mode_paiement' => ['nullable', 'string', Rule::in(StoreDomiciliationRequest::MODES_PAIEMENT)],
            'prix_par_mois' => ['nullable', 'numeric', 'min:0'],
            'prix_total' => ['nullable', 'numeric', 'min:0'],
            'signature_sur_facture' => ['nullable', 'boolean'],
            'date_facture' => ['nullable', 'date'],
            'date_paiement' => ['nullable', 'date'],
            'date_legalisation' => ['nullable', 'date'],
            'doc_facture' => ['nullable', 'boolean'],
            'doc_contrat' => ['nullable', 'boolean'],
            'doc_attestation' => ['nullable', 'boolean'],
            'doc_procuration' => ['nullable', 'boolean'],
            'commentaire' => ['nullable', 'string', 'max:5000'],
            'fichier' => ['nullable', 'file', 'max:5120'],
        ]);

        $nouvelle = DB::transaction(function () use ($request, $domiciliation, $data) {
            $booleens = ['signature_sur_facture', 'doc_facture', 'doc_contrat', 'doc_attestation', 'doc_procuration'];
            $attributs = [
                'entreprise_id' => $domiciliation->entreprise_id,
                'centre_domiciliation_id' => $domiciliation->centre_domiciliation_id,
                'renouvelle_de_id' => $domiciliation->id,
                'created_by' => $request->user()->id,
            ];

            foreach (['date_depart', 'date_fin', 'mois_payee', 'mois_gratuits', 'mode_paiement',
                'prix_par_mois', 'prix_total', 'date_facture', 'date_paiement', 'date_legalisation'] as $champ) {
                if (array_key_exists($champ, $data)) {
                    $attributs[$champ] = $data[$champ];
                }
            }
            // En multipart, « 0 » et « false » arrivent en chaînes de caractères.
            foreach ($booleens as $champ) {
                if ($request->has($champ)) {
                    $attributs[$champ] = filter_var($request->input($champ), FILTER_VALIDATE_BOOLEAN);
                }
            }

            $nouvelle = Domiciliation::create($attributs);
            $this->journaliser($request, $domiciliation, 'renouvellement');

            return $nouvelle->refresh();
        });

        return new DomiciliationResource($nouvelle->load(self::RELATIONS));
    }

    /** Action « Déclaré » du tableau Gestion de domiciliation. */
    public function declarer(Request $request, Domiciliation $domiciliation)
    {
        $request->validate([
            'commentaire' => ['nullable', 'string', 'max:5000'],
            'fichier' => ['nullable', 'file', 'max:5120'],
        ]);

        DB::transaction(function () use ($request, $domiciliation) {
            $domiciliation->update(['etat' => 'declare', 'date_declaration' => now()->toDateString()]);
            $this->journaliser($request, $domiciliation, 'declaration');
        });

        return new DomiciliationResource($domiciliation->load(self::RELATIONS));
    }

    /** Action « Résilier » du tableau Gestion de domiciliation. */
    public function resilier(Request $request, Domiciliation $domiciliation)
    {
        $request->validate([
            'commentaire' => ['nullable', 'string', 'max:5000'],
            'fichier' => ['nullable', 'file', 'max:5120'],
        ]);

        DB::transaction(function () use ($request, $domiciliation) {
            $domiciliation->update(['etat' => 'resilie', 'date_resiliation' => now()->toDateString()]);
            $this->journaliser($request, $domiciliation, 'resiliation');
        });

        return new DomiciliationResource($domiciliation->load(self::RELATIONS));
    }

    /**
     * Action « Activer » : annule Déclarer/Résilier et remet la période à
     * l'état actif. Pendant manquant de `declarer`/`resilier`, nécessaire au
     * menu d'actions de la Gestion Domiciliation.
     */
    public function activer(Request $request, Domiciliation $domiciliation)
    {
        DB::transaction(function () use ($request, $domiciliation) {
            $domiciliation->update(['etat' => 'active', 'date_declaration' => null, 'date_resiliation' => null]);
            $this->journaliser($request, $domiciliation, 'activation');
        });

        return new DomiciliationResource($domiciliation->load(self::RELATIONS));
    }

    /** Téléchargement du justificatif joint à une action. */
    public function downloadOperationFichier(Domiciliation $domiciliation, DomiciliationOperation $operation)
    {
        abort_if($operation->domiciliation_id !== $domiciliation->id, 404);
        abort_unless($operation->fichier_chemin, 404);
        abort_unless(Storage::disk('public')->exists($operation->fichier_chemin), 404);

        return Storage::disk('public')->download($operation->fichier_chemin, $operation->fichier_nom);
    }

    /** Action « Ajouter Observation ». */
    public function storeObservation(Request $request, Domiciliation $domiciliation)
    {
        $data = $request->validate([
            'contenu' => ['required', 'string', 'max:5000'],
            'privee' => ['nullable', 'boolean'],
            'fichier' => ['nullable', 'file', 'max:5120'],
        ]);

        $file = $request->file('fichier');

        DomiciliationObservation::create([
            'domiciliation_id' => $domiciliation->id,
            'contenu' => $data['contenu'],
            // En multipart (dès qu'un fichier est joint), « 0 »/« false » arrivent
            // en chaînes de caractères — d'où le filtre booléen explicite.
            'privee' => filter_var($request->input('privee', false), FILTER_VALIDATE_BOOLEAN),
            'fichier_nom' => $file?->getClientOriginalName(),
            'fichier_chemin' => $file?->store('domiciliations/observations', 'public'),
            'created_by' => $request->user()->id,
        ]);

        return new DomiciliationResource($domiciliation->load(self::RELATIONS));
    }

    /** Pièce jointe d'une observation : suit la visibilité de l'observation. */
    public function downloadObservationFichier(Request $request, Domiciliation $domiciliation, DomiciliationObservation $observation)
    {
        abort_if($observation->domiciliation_id !== $domiciliation->id, 404);
        abort_unless($observation->estVisiblePar($request->user()), 403);
        abort_unless($observation->fichier_chemin, 404);
        abort_unless(Storage::disk('public')->exists($observation->fichier_chemin), 404);

        return Storage::disk('public')->download($observation->fichier_chemin, $observation->fichier_nom);
    }

    /** Action « Ajouter Document ». */
    public function storeDocument(Request $request, Domiciliation $domiciliation)
    {
        $request->validate([
            'fichier' => ['required', 'file', 'max:5120'],
            'nom' => ['nullable', 'string', 'max:200'],
        ]);

        $file = $request->file('fichier');
        $path = $file->store('domiciliations', 'public');

        DomiciliationDocument::create([
            'domiciliation_id' => $domiciliation->id,
            'nom' => $request->input('nom') ?: $file->getClientOriginalName(),
            'chemin' => $path,
            'mime' => $file->getClientMimeType(),
            'taille' => $file->getSize(),
            'uploaded_by' => $request->user()->id,
        ]);

        return new DomiciliationResource($domiciliation->load(self::RELATIONS));
    }

    public function destroyDocument(Domiciliation $domiciliation, DomiciliationDocument $document)
    {
        abort_if($document->domiciliation_id !== $domiciliation->id, 404);

        // Même règle que partout ailleurs : suppression définitive uniquement
        // depuis la Corbeille.
        if ($document->status !== 'corbeille') {
            return response()->json([
                'message' => 'Seul un document déjà placé dans la Corbeille peut être supprimé définitivement.',
            ], 422);
        }

        Storage::disk('public')->delete($document->chemin);
        $document->delete();

        return new DomiciliationResource($domiciliation->load(self::RELATIONS));
    }

    public function archiveDocument(Domiciliation $domiciliation, DomiciliationDocument $document)
    {
        return $this->changerStatutDocument($domiciliation, $document, 'archive');
    }

    public function corbeilleDocument(Domiciliation $domiciliation, DomiciliationDocument $document)
    {
        return $this->changerStatutDocument($domiciliation, $document, 'corbeille');
    }

    public function restoreDocument(Domiciliation $domiciliation, DomiciliationDocument $document)
    {
        return $this->changerStatutDocument($domiciliation, $document, 'actif');
    }

    private function changerStatutDocument(Domiciliation $domiciliation, DomiciliationDocument $document, string $status)
    {
        abort_if($document->domiciliation_id !== $domiciliation->id, 404);
        $document->update(['status' => $status]);

        return new DomiciliationResource($domiciliation->load(self::RELATIONS));
    }

    public function destroyObservation(Request $request, Domiciliation $domiciliation, DomiciliationObservation $observation)
    {
        abort_if($observation->domiciliation_id !== $domiciliation->id, 404);
        abort_unless($observation->estVisiblePar($request->user()), 403);

        if ($observation->status !== 'corbeille') {
            return response()->json([
                'message' => 'Seule une observation déjà placée dans la Corbeille peut être supprimée définitivement.',
            ], 422);
        }

        $observation->delete();

        return new DomiciliationResource($domiciliation->load(self::RELATIONS));
    }

    public function archiveObservation(Request $request, Domiciliation $domiciliation, DomiciliationObservation $observation)
    {
        return $this->changerStatutObservation($request, $domiciliation, $observation, 'archive');
    }

    public function corbeilleObservation(Request $request, Domiciliation $domiciliation, DomiciliationObservation $observation)
    {
        return $this->changerStatutObservation($request, $domiciliation, $observation, 'corbeille');
    }

    public function restoreObservation(Request $request, Domiciliation $domiciliation, DomiciliationObservation $observation)
    {
        return $this->changerStatutObservation($request, $domiciliation, $observation, 'actif');
    }

    private function changerStatutObservation(
        Request $request,
        Domiciliation $domiciliation,
        DomiciliationObservation $observation,
        string $status
    ) {
        abort_if($observation->domiciliation_id !== $domiciliation->id, 404);
        abort_unless($observation->estVisiblePar($request->user()), 403);

        $observation->update(['status' => $status]);

        return new DomiciliationResource($domiciliation->load(self::RELATIONS));
    }
}
