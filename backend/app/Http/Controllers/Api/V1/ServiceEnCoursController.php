<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ServiceEnCoursOperationResource;
use App\Http\Resources\ServiceEnCoursResource;
use App\Models\ServiceEnCours;
use App\Models\ServiceEnCoursOperation;
use App\Models\ServiceStatus;
use App\Rules\FichierAutorise;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * « Services en cours » : le service SUIVI (un par couple client / service) et son fil d'ACTIVITÉ (`operations`) :
 * création automatique, changement de statut, commentaire, fichier ajouté.
 *
 * Droits : lecture = `services_en_cours.list` ; tout ce qui écrit (statut, commentaire, fichier, modification) =
 * `services_en_cours.modifier` ; archive / corbeille / suppression ont les leurs (voir routes/api.php).
 */
class ServiceEnCoursController extends Controller
{
    private const RELATIONS = ['service', 'client', 'statut', 'operations.statut', 'operations.ancienStatut', 'operations.auteur'];

    /** Un même utilisateur qui renvoie la même opération dans ce délai (double clic, réseau lent) n'ajoute rien. */
    private const DELAI_DOUBLON_SECONDES = 5;

    public function index(Request $request)
    {
        $rows = ServiceEnCours::with(self::RELATIONS)
            ->status($request->query('status', 'actif'))
            ->orderByDesc('id')
            ->get();

        return ServiceEnCoursResource::collection($rows);
    }

    /**
     * Statuts proposés pour un service : ceux de Paramètres → Services, ni plus ni moins. Servis avec le droit de lecture de
     * « Services en cours » (et non celui de Paramètres, réservé à l'administrateur) pour qu'un utilisateur habilité à changer
     * un statut voie la liste.
     */
    public function statuts()
    {
        return ServiceStatus::orderBy('id')->get(['id', 'nom', 'couleur_texte', 'couleur_fond']);
    }

    /** Fil « Activité Services » : dernières opérations, tous services confondus (plus récente d'abord). */
    public function activite(Request $request)
    {
        $limit = min(max((int) $request->query('limit', 15), 1), 50);

        return ServiceEnCoursOperation::with(['statut', 'ancienStatut', 'auteur', 'serviceEnCours.service', 'serviceEnCours.client'])
            ->whereHas('serviceEnCours') // l'activité d'un service supprimé définitivement n'a plus de support à afficher
            ->latest('id')
            ->limit($limit)
            ->get()
            ->map(fn ($o) => (new ServiceEnCoursOperationResource($o))->resolve($request))
            ->values();
    }

    public function show(ServiceEnCours $serviceEnCour)
    {
        return new ServiceEnCoursResource($serviceEnCour->load(self::RELATIONS));
    }

    public function update(Request $request, ServiceEnCours $serviceEnCour)
    {
        $data = $request->validate([
            'service_id' => ['sometimes', 'integer', 'exists:services,id'],
            'client_id' => ['sometimes', 'integer', 'exists:clients,party_id'],
            'service_status_id' => ['sometimes', 'nullable', 'integer', 'exists:service_statuses,id'],
            'date_depart' => ['sometimes', 'date'],
        ]);

        DB::transaction(function () use ($request, $serviceEnCour, $data) {
            $ancien = $serviceEnCour->service_status_id;
            $serviceEnCour->update($data);

            // Un statut changé depuis le formulaire de modification laisse la même trace que depuis le tableau.
            if (array_key_exists('service_status_id', $data) && (int) $data['service_status_id'] !== (int) $ancien) {
                ServiceEnCoursOperation::enregistrer([
                    'service_en_cours_id' => $serviceEnCour->id,
                    'action' => ServiceEnCoursOperation::ACTION_STATUT,
                    'service_status_id' => $data['service_status_id'],
                    'ancien_status_id' => $ancien,
                    'created_by' => $request->user()->id,
                ]);
                $serviceEnCour->update(['derniere_operation' => now()]);
            }
        });

        return new ServiceEnCoursResource($serviceEnCour->load(self::RELATIONS));
    }

    /**
     * Ajoute une opération au fil d'activité du service : changement de statut, commentaire et/ou fichier joint.
     *
     * Au moins un des trois est exigé (pas d'activité vide) et un statut identique à l'actuel ne compte pas comme un
     * changement. L'opération enregistre l'auteur, la date et l'heure réels, le statut APRÈS l'opération et, quand il
     * change, l'ANCIEN statut. Les anciens commentaires ne sont jamais modifiés.
     */
    public function storeOperation(Request $request, ServiceEnCours $serviceEnCour)
    {
        $request->validate([
            'service_status_id' => ['nullable', 'integer', 'exists:service_statuses,id'],
            'commentaire' => ['nullable', 'string', 'max:2000'],
            'fichier' => ['nullable', 'file', FichierAutorise::document(), 'max:5120'],
        ]);

        $nouveau = $request->input('service_status_id') ?: null;
        $commentaire = trim((string) $request->input('commentaire', ''));
        $commentaire = $commentaire === '' ? null : $commentaire;
        $fichier = $request->file('fichier');
        $utilisateur = $request->user()->id;
        $chemin = null;

        try {
            DB::transaction(function () use ($serviceEnCour, $nouveau, $commentaire, $fichier, $utilisateur, &$chemin) {
                // Sous verrou : deux envois simultanés se suivent, le second voit le premier.
                $ligne = ServiceEnCours::whereKey($serviceEnCour->id)->lockForUpdate()->firstOrFail();
                $ancien = $ligne->service_status_id;
                $changeStatut = $nouveau !== null && (int) $nouveau !== (int) $ancien;

                $dernier = ServiceEnCoursOperation::where('service_en_cours_id', $ligne->id)->latest('id')->first();
                $doublon = ! $fichier && ($nouveau !== null || $commentaire !== null) && $dernier !== null
                    && (int) $dernier->created_by === $utilisateur
                    && $dernier->created_at->gte(now()->subSeconds(self::DELAI_DOUBLON_SECONDES))
                    && ($nouveau === null || (int) $dernier->service_status_id === (int) $nouveau)
                    && (string) $dernier->commentaire === (string) $commentaire;
                if ($doublon) {
                    return;
                }

                if (! $changeStatut && $commentaire === null && ! $fichier) {
                    throw ValidationException::withMessages(['service_status_id' => [
                        $nouveau !== null
                            ? 'Ce statut est déjà celui du service : choisissez-en un autre, ou ajoutez un commentaire ou un fichier.'
                            : 'Choisissez un statut, saisissez un commentaire ou joignez un fichier.',
                    ]]);
                }

                $operation = [
                    'service_en_cours_id' => $ligne->id,
                    'action' => $changeStatut
                        ? ServiceEnCoursOperation::ACTION_STATUT
                        : ($fichier ? ServiceEnCoursOperation::ACTION_FICHIER : ServiceEnCoursOperation::ACTION_COMMENTAIRE),
                    'service_status_id' => $changeStatut ? (int) $nouveau : $ancien,
                    'ancien_status_id' => $changeStatut ? $ancien : null,
                    'commentaire' => $commentaire,
                    'created_by' => $utilisateur,
                ];

                if ($fichier) {
                    // Un dossier par service en cours (donc par client) : les fichiers de clients différents ne se mélangent pas.
                    $chemin = $fichier->store("services-en-cours/{$ligne->id}", 'public');
                    $operation['fichier_chemin'] = $chemin;
                    $operation['fichier_nom'] = $fichier->getClientOriginalName();
                }

                ServiceEnCoursOperation::enregistrer($operation);

                $maj = ['derniere_operation' => now()];
                if ($changeStatut) {
                    $maj['service_status_id'] = (int) $nouveau;
                }
                $ligne->update($maj);
            });
        } catch (\Throwable $e) {
            if ($chemin) {
                Storage::disk('public')->delete($chemin);
            }
            throw $e;
        }

        return new ServiceEnCoursResource($serviceEnCour->refresh()->load(self::RELATIONS));
    }

    /**
     * Remplace (ou ajoute, si l'opération n'en a pas) le fichier AJOUTÉ À LA MAIN sur une opération du service.
     * La pièce jointe du document d'origine (`source_fichier_*`) n'est jamais touchée.
     */
    public function remplacerFichier(Request $request, ServiceEnCours $serviceEnCour, ServiceEnCoursOperation $operation)
    {
        abort_unless((int) $operation->service_en_cours_id === (int) $serviceEnCour->id, 404);

        $request->validate([
            'fichier' => ['required', 'file', FichierAutorise::document(), 'max:5120'],
        ]);

        $fichier = $request->file('fichier');
        $ancienChemin = $operation->fichier_chemin;
        $chemin = $fichier->store("services-en-cours/{$serviceEnCour->id}", 'public');

        try {
            DB::transaction(function () use ($operation, $serviceEnCour, $fichier, $chemin) {
                $operation->update(['fichier_chemin' => $chemin, 'fichier_nom' => $fichier->getClientOriginalName()]);
                $serviceEnCour->update(['derniere_operation' => now()]);
            });
        } catch (\Throwable $e) {
            Storage::disk('public')->delete($chemin);
            throw $e;
        }

        if ($ancienChemin) {
            Storage::disk('public')->delete($ancienChemin);
        }

        return new ServiceEnCoursResource($serviceEnCour->refresh()->load(self::RELATIONS));
    }

    /**
     * Supprime le fichier AJOUTÉ À LA MAIN sur une opération. L'opération reste (historique, commentaire, statut), sauf si elle
     * n'était qu'un ajout de fichier : elle n'a alors plus rien à montrer. La pièce jointe du document d'origine n'est jamais touchée.
     */
    public function supprimerFichier(ServiceEnCours $serviceEnCour, ServiceEnCoursOperation $operation)
    {
        abort_unless((int) $operation->service_en_cours_id === (int) $serviceEnCour->id, 404);
        abort_unless($operation->fichier_chemin, 404);

        $chemin = $operation->fichier_chemin;

        DB::transaction(function () use ($operation) {
            $fichierSeul = $operation->action === ServiceEnCoursOperation::ACTION_FICHIER && $operation->commentaire === null;

            $fichierSeul
                ? $operation->delete()
                : $operation->update(['fichier_chemin' => null, 'fichier_nom' => null]);
        });

        Storage::disk('public')->delete($chemin);

        return new ServiceEnCoursResource($serviceEnCour->refresh()->load(self::RELATIONS));
    }

    public function archive(ServiceEnCours $serviceEnCour)
    {
        $serviceEnCour->update(['status' => 'archive']);

        return new ServiceEnCoursResource($serviceEnCour->load(self::RELATIONS));
    }

    public function corbeille(ServiceEnCours $serviceEnCour)
    {
        $serviceEnCour->update(['status' => 'corbeille']);

        return new ServiceEnCoursResource($serviceEnCour->load(self::RELATIONS));
    }

    public function restore(ServiceEnCours $serviceEnCour)
    {
        $serviceEnCour->update(['status' => 'actif']);

        return new ServiceEnCoursResource($serviceEnCour->load(self::RELATIONS));
    }

    public function destroy(ServiceEnCours $serviceEnCour)
    {
        if ($serviceEnCour->status !== 'corbeille') {
            return response()->json([
                'message' => 'Seul un service en cours déjà placé dans la Corbeille peut être supprimé définitivement.',
            ], 422);
        }

        // Seuls les fichiers AJOUTÉS AU SERVICE sont supprimés avec lui ; la pièce jointe du document d'origine
        // (`source_fichier_chemin`, ex. celle d'un paiement) lui appartient et n'est jamais effacée ici.
        foreach ($serviceEnCour->operations as $operation) {
            if ($operation->fichier_chemin) {
                Storage::disk('public')->delete($operation->fichier_chemin);
            }
        }

        $serviceEnCour->delete();

        return response()->json(['message' => 'Service en cours supprimé définitivement.']);
    }
}
