<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ServiceEnCoursResource;
use App\Models\ServiceEnCours;
use App\Models\ServiceEnCoursOperation;
use App\Rules\FichierAutorise;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ServiceEnCoursController extends Controller
{
    private const RELATIONS = ['service', 'client', 'statut', 'operations.statut', 'operations.auteur'];

    public function index(Request $request)
    {
        $rows = ServiceEnCours::with(self::RELATIONS)
            ->status($request->query('status', 'actif'))
            ->orderByDesc('id')
            ->get();

        return ServiceEnCoursResource::collection($rows);
    }

    /** Fil « Activité Services » : dernières opérations, tous services confondus. */
    public function activite(Request $request)
    {
        $limit = min((int) $request->query('limit', 15), 50);

        return ServiceEnCoursOperation::with(['statut', 'auteur', 'serviceEnCours.service'])
            ->latest('id')
            ->limit($limit)
            ->get()
            ->map(fn ($o) => [
                'id' => $o->id,
                'serviceEnCoursId' => $o->service_en_cours_id,
                'service' => $o->serviceEnCours->service->nom ?? null,
                'commentaire' => $o->commentaire,
                'statut' => $o->statut ? [
                    'nom' => $o->statut->nom,
                    'couleurTexte' => $o->statut->couleur_texte,
                    'couleurFond' => $o->statut->couleur_fond,
                ] : null,
                'par' => $o->auteur->name ?? null,
                'fichierNom' => $o->fichier_nom,
                'fichierChemin' => $o->fichier_chemin,
                'createdAt' => optional($o->created_at)->toDateTimeString(),
            ]);
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

        $serviceEnCour->update($data);

        return new ServiceEnCoursResource($serviceEnCour->load(self::RELATIONS));
    }

    /**
     * Ajoute une opération au fil d'activité : change éventuellement le statut du
     * service, met à jour « Dernière Opération » et accepte un fichier joint.
     */
    public function storeOperation(Request $request, ServiceEnCours $serviceEnCour)
    {
        $request->validate([
            'service_status_id' => ['nullable', 'integer', 'exists:service_statuses,id'],
            'commentaire' => ['nullable', 'string', 'max:2000'],
            'fichier' => ['nullable', 'file', FichierAutorise::document(), 'max:5120'],
        ]);

        $operation = [
            'service_en_cours_id' => $serviceEnCour->id,
            'service_status_id' => $request->input('service_status_id') ?: null,
            'commentaire' => $request->input('commentaire'),
            'created_by' => $request->user()->id,
        ];

        if ($request->hasFile('fichier')) {
            $file = $request->file('fichier');
            $operation['fichier_chemin'] = $file->store('services-en-cours', 'public');
            $operation['fichier_nom'] = $file->getClientOriginalName();
        }

        ServiceEnCoursOperation::create($operation);

        $maj = ['derniere_operation' => now()];
        if ($operation['service_status_id']) {
            $maj['service_status_id'] = $operation['service_status_id'];
        }
        $serviceEnCour->update($maj);

        return new ServiceEnCoursResource($serviceEnCour->load(self::RELATIONS));
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

        foreach ($serviceEnCour->operations as $operation) {
            if ($operation->fichier_chemin) {
                Storage::disk('public')->delete($operation->fichier_chemin);
            }
        }

        $serviceEnCour->delete();

        return response()->json(['message' => 'Service en cours supprimé définitivement.']);
    }
}
