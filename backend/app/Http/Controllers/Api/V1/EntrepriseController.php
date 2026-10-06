<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEntrepriseRequest;
use App\Http\Requests\UpdateEntrepriseRequest;
use App\Http\Resources\EntrepriseResource;
use App\Models\Client;
use App\Models\Entreprise;
use App\Models\EntrepriseAssocie;
use App\Models\EntrepriseDocument;
use App\Models\EntrepriseObservation;
use App\Models\EntrepriseObservationFichier;
use App\Models\EntrepriseSecteur;
use App\Models\Party;
use App\Modules\Domiciliation\Contracts\CentresDomiciliationReference;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class EntrepriseController extends Controller
{
    public function __construct(private CentresDomiciliationReference $centres)
    {
    }

    /**
     * Relations chargées pour toute fiche entreprise renvoyée par l'API.
     * `associes`, `documents` et `observationsListe` alimentent les blocs de la
     * page Détails ainsi que le bloc Client/CIN/Type du formulaire.
     */
    private const RELATIONS = [
        'party.auteur', 'client', 'secteurs',
        'associes', 'documents.auteur', 'observationsListe.auteur',
        'observationsListe.fichiers',
    ];

    private function mapAttributes(array $data): array
    {
        $map = [
            'denomination' => 'denomination', 'tribunal' => 'tribunal', 'forme' => 'forme_juridique',
            'ice' => 'ice', 'rc' => 'rc', 'if' => 'if', 'tp' => 'tp', 'cnss' => 'cnss',
            'dateDebut' => 'date_debut_activite', 'capital' => 'capital', 'single' => 'single',
            'periode' => 'periode_declaration_tva', 'local' => 'local',
            'numDossier' => 'numero_dossier', 'numArchive' => 'numero_archive', 'observation' => 'observation',
        ];

        $attributes = [];
        foreach ($map as $input => $column) {
            if (array_key_exists($input, $data)) {
                $attributes[$column] = $data[$input];
            }
        }

        if (array_key_exists('centreDomiciliation', $data)) {
            $attributes['centre_domiciliation_id'] = $data['centreDomiciliation']
                ? $this->centres->idParNom($data['centreDomiciliation'])
                : null;
        }

        if (array_key_exists('client', $data)) {
            $attributes['client_id'] = $data['client']
                ? Client::where('nom', $data['client'])->value('party_id')
                : null;
        }

        return $attributes;
    }

    private function syncSecteurs(Entreprise $entreprise, array $secteurs): void
    {
        EntrepriseSecteur::where('entreprise_id', $entreprise->party_id)->delete();
        foreach (array_values($secteurs) as $i => $row) {
            if (empty($row['secteur'])) continue;
            EntrepriseSecteur::create([
                'entreprise_id' => $entreprise->party_id,
                'secteur' => $row['secteur'],
                'activite' => $row['activite'] ?? null,
                'ordre' => $i + 1,
            ]);
        }
    }

    /**
     * Remplace la liste des personnes rattachées (gérants, associés…).
     * Même principe que `syncSecteurs` : la liste envoyée fait foi.
     */
    private function syncAssocies(Entreprise $entreprise, array $associes): void
    {
        EntrepriseAssocie::where('entreprise_id', $entreprise->party_id)->delete();
        foreach (array_values($associes) as $i => $row) {
            if (empty($row['nom'])) continue;
            EntrepriseAssocie::create([
                'entreprise_id' => $entreprise->party_id,
                'nom' => $row['nom'],
                'cin' => $row['cin'] ?? null,
                'type' => $row['type'] ?? null,
                'adresse' => $row['adresse'] ?? null,
                'telephone' => $row['telephone'] ?? null,
                'telephone_2' => $row['telephone2'] ?? null,
                'email' => $row['email'] ?? null,
                'ordre' => $i + 1,
            ]);
        }
    }

    public function index(Request $request)
    {
        $status = $request->query('status', 'actif');

        $entreprises = Entreprise::withStatus($status)
            ->with(self::RELATIONS)
            ->orderByDesc('party_id')
            ->get();
        Entreprise::chargerCentresDomiciliation($entreprises);

        return EntrepriseResource::collection($entreprises);
    }

    public function store(StoreEntrepriseRequest $request)
    {
        $data = $request->validated();

        $entreprise = DB::transaction(function () use ($data, $request) {
            $party = Party::create([
                'type' => 'entreprise', 'status' => 'actif', 'created_by' => $request->user()->id,
            ]);

            $entreprise = Entreprise::create(array_merge(
                ['party_id' => $party->id, 'type' => 'entreprise'],
                $this->mapAttributes($data)
            ));

            $this->syncSecteurs($entreprise, $data['secteurs'] ?? []);
            $this->syncAssocies($entreprise, $data['associes'] ?? []);

            return $entreprise->refresh();
        });

        return new EntrepriseResource($entreprise->load(self::RELATIONS));
    }

    public function show(Entreprise $entreprise)
    {
        abort_if(! $entreprise->party, 404);

        return new EntrepriseResource($entreprise->load(self::RELATIONS));
    }

    public function update(UpdateEntrepriseRequest $request, Entreprise $entreprise)
    {
        abort_if(! $entreprise->party, 404);
        $data = $request->validated();

        DB::transaction(function () use ($entreprise, $data) {
            $entreprise->update($this->mapAttributes($data));
            if (array_key_exists('secteurs', $data)) {
                $this->syncSecteurs($entreprise, $data['secteurs'] ?? []);
            }
            if (array_key_exists('associes', $data)) {
                $this->syncAssocies($entreprise, $data['associes'] ?? []);
            }
        });

        return new EntrepriseResource($entreprise->load(self::RELATIONS));
    }

    public function archive(Entreprise $entreprise)
    {
        abort_if(! $entreprise->party, 404);
        $entreprise->party->update(['status' => 'archive']);

        return new EntrepriseResource($entreprise->load(self::RELATIONS));
    }

    public function corbeille(Entreprise $entreprise)
    {
        abort_if(! $entreprise->party, 404);
        $entreprise->party->update(['status' => 'corbeille']);

        return new EntrepriseResource($entreprise->load(self::RELATIONS));
    }

    public function restore(Entreprise $entreprise)
    {
        abort_if(! $entreprise->party, 404);
        $entreprise->party->update(['status' => 'actif']);

        return new EntrepriseResource($entreprise->load(self::RELATIONS));
    }

    public function destroy(Entreprise $entreprise)
    {
        abort_if(! $entreprise->party, 404);

        if ($entreprise->party->status !== 'corbeille') {
            return response()->json([
                'message' => 'Seule une entreprise déjà placée dans la Corbeille peut être supprimée définitivement.',
            ], 422);
        }

        $entreprise->party->delete();

        return response()->json(['message' => 'Entreprise supprimée définitivement.']);
    }

    // ------------------------------------------------------------------
    // Liste Noire / Bloquer — reprennent `entreprises.situation`, la colonne
    // déjà affichée par la référence (« Normale » par défaut). Les deux états
    // sont mutuellement exclusifs : le plus récent l'emporte.
    // Permissions déjà présentes au catalogue (`liste_noire`, `bloquer`),
    // simplement jamais branchées à une route jusqu'ici.
    // ------------------------------------------------------------------

    public const SITUATION_NORMALE = 'Normale';

    public const SITUATION_LISTE_NOIRE = 'Liste Noire';

    public const SITUATION_BLOQUE = 'Bloqué';

    private function changerSituation(Entreprise $entreprise, string $situation)
    {
        abort_if(! $entreprise->party, 404);
        $entreprise->update(['situation' => $situation]);

        return new EntrepriseResource($entreprise->load(self::RELATIONS));
    }

    public function listeNoire(Entreprise $entreprise)
    {
        return $this->changerSituation($entreprise, self::SITUATION_LISTE_NOIRE);
    }

    public function retirerListeNoire(Entreprise $entreprise)
    {
        return $this->changerSituation($entreprise, self::SITUATION_NORMALE);
    }

    public function bloquer(Entreprise $entreprise)
    {
        return $this->changerSituation($entreprise, self::SITUATION_BLOQUE);
    }

    public function debloquer(Entreprise $entreprise)
    {
        return $this->changerSituation($entreprise, self::SITUATION_NORMALE);
    }

    // ------------------------------------------------------------------
    // Bloc « Documents » de la fiche entreprise
    // ------------------------------------------------------------------

    public function storeDocument(Request $request, Entreprise $entreprise)
    {
        abort_if(! $entreprise->party, 404);

        $request->validate([
            'fichier' => ['required', 'file', 'max:5120'],
            'nom' => ['nullable', 'string', 'max:200'],
        ]);

        $file = $request->file('fichier');

        EntrepriseDocument::create([
            'entreprise_id' => $entreprise->party_id,
            'nom' => $request->input('nom') ?: $file->getClientOriginalName(),
            'chemin' => $file->store('entreprises', 'public'),
            'mime' => $file->getClientMimeType(),
            'taille' => $file->getSize(),
            'uploaded_by' => $request->user()->id,
        ]);

        return new EntrepriseResource($entreprise->load(self::RELATIONS));
    }

    /**
     * Téléchargement d'un document joint.
     * Renvoie le fichier lui-même, pas la fiche : c'est la seule route du module
     * qui ne retourne pas une EntrepriseResource.
     */
    public function downloadDocument(Entreprise $entreprise, EntrepriseDocument $document)
    {
        abort_if($document->entreprise_id !== $entreprise->party_id, 404);
        abort_unless(Storage::disk('public')->exists($document->chemin), 404);

        return Storage::disk('public')->download($document->chemin, $document->nom);
    }

    public function archiveDocument(Entreprise $entreprise, EntrepriseDocument $document)
    {
        return $this->changerStatutDocument($entreprise, $document, 'archive');
    }

    public function corbeilleDocument(Entreprise $entreprise, EntrepriseDocument $document)
    {
        return $this->changerStatutDocument($entreprise, $document, 'corbeille');
    }

    public function restoreDocument(Entreprise $entreprise, EntrepriseDocument $document)
    {
        return $this->changerStatutDocument($entreprise, $document, 'actif');
    }

    private function changerStatutDocument(Entreprise $entreprise, EntrepriseDocument $document, string $status)
    {
        abort_if($document->entreprise_id !== $entreprise->party_id, 404);
        $document->update(['status' => $status]);

        return new EntrepriseResource($entreprise->load(self::RELATIONS));
    }

    public function destroyDocument(Entreprise $entreprise, EntrepriseDocument $document)
    {
        abort_if($document->entreprise_id !== $entreprise->party_id, 404);

        // Même règle que partout ailleurs : suppression définitive uniquement
        // depuis la Corbeille.
        if ($document->status !== 'corbeille') {
            return response()->json([
                'message' => 'Seul un document déjà placé dans la Corbeille peut être supprimé définitivement.',
            ], 422);
        }

        Storage::disk('public')->delete($document->chemin);
        $document->delete();

        return new EntrepriseResource($entreprise->load(self::RELATIONS));
    }

    // ------------------------------------------------------------------
    // Bloc « Observations » de la fiche entreprise
    // ------------------------------------------------------------------

    public function storeObservation(Request $request, Entreprise $entreprise)
    {
        abort_if(! $entreprise->party, 404);

        $data = $request->validate([
            'contenu' => ['required', 'string', 'max:5000'],
            'privee' => ['nullable', 'boolean'],
            'fichiers' => ['nullable', 'array', 'max:10'],
            'fichiers.*' => ['file', 'max:5120'],
        ]);

        DB::transaction(function () use ($request, $entreprise, $data) {
            $observation = EntrepriseObservation::create([
                'entreprise_id' => $entreprise->party_id,
                'contenu' => $data['contenu'],
                // Le champ arrive en multipart quand il y a des fichiers :
                // « 0 » / « false » y sont des chaînes, d'où le filtre booléen.
                'privee' => filter_var($request->input('privee', false), FILTER_VALIDATE_BOOLEAN),
                'created_by' => $request->user()->id,
            ]);

            foreach ($request->file('fichiers', []) as $file) {
                EntrepriseObservationFichier::create([
                    'observation_id' => $observation->id,
                    'nom' => $file->getClientOriginalName(),
                    'chemin' => $file->store('entreprises/observations', 'public'),
                    'mime' => $file->getClientMimeType(),
                    'taille' => $file->getSize(),
                    'uploaded_by' => $request->user()->id,
                ]);
            }
        });

        return new EntrepriseResource($entreprise->load(self::RELATIONS));
    }

    /** Téléchargement d'une pièce jointe d'observation. */
    public function downloadObservationFichier(
        Request $request,
        Entreprise $entreprise,
        EntrepriseObservation $observation,
        EntrepriseObservationFichier $fichier
    ) {
        abort_if($observation->entreprise_id !== $entreprise->party_id, 404);
        abort_if($fichier->observation_id !== $observation->id, 404);
        // Une pièce jointe suit la visibilité de son observation.
        abort_unless($observation->estVisiblePar($request->user()), 403);
        abort_unless(Storage::disk('public')->exists($fichier->chemin), 404);

        return Storage::disk('public')->download($fichier->chemin, $fichier->nom);
    }

    public function archiveObservation(Request $request, Entreprise $entreprise, EntrepriseObservation $observation)
    {
        return $this->changerStatutObservation($request, $entreprise, $observation, 'archive');
    }

    public function corbeilleObservation(Request $request, Entreprise $entreprise, EntrepriseObservation $observation)
    {
        return $this->changerStatutObservation($request, $entreprise, $observation, 'corbeille');
    }

    public function restoreObservation(Request $request, Entreprise $entreprise, EntrepriseObservation $observation)
    {
        return $this->changerStatutObservation($request, $entreprise, $observation, 'actif');
    }

    private function changerStatutObservation(
        Request $request,
        Entreprise $entreprise,
        EntrepriseObservation $observation,
        string $status
    ) {
        abort_if($observation->entreprise_id !== $entreprise->party_id, 404);
        // Qui ne peut pas la lire ne peut pas agir dessus.
        abort_unless($observation->estVisiblePar($request->user()), 403);

        $observation->update(['status' => $status]);

        return new EntrepriseResource($entreprise->load(self::RELATIONS));
    }

    public function destroyObservation(Request $request, Entreprise $entreprise, EntrepriseObservation $observation)
    {
        abort_if($observation->entreprise_id !== $entreprise->party_id, 404);
        abort_unless($observation->estVisiblePar($request->user()), 403);

        if ($observation->status !== 'corbeille') {
            return response()->json([
                'message' => 'Seule une observation déjà placée dans la Corbeille peut être supprimée définitivement.',
            ], 422);
        }

        DB::transaction(function () use ($observation) {
            // Les pièces jointes partent avec l'observation, fichiers compris.
            foreach ($observation->fichiers as $fichier) {
                Storage::disk('public')->delete($fichier->chemin);
                $fichier->delete();
            }
            $observation->delete();
        });

        return new EntrepriseResource($entreprise->load(self::RELATIONS));
    }
}
