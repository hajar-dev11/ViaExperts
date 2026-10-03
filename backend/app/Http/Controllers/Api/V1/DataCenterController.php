<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreDataCenterFicheRequest;
use App\Http\Requests\UpdateDataCenterFicheRequest;
use App\Models\DataCenterFiche;
use Illuminate\Http\Request;

/**
 * Data Center — capture image68 « List des Data ».
 *
 * Les permissions sont portées par le middleware `permission:data_center,<action>`
 * déclaré dans routes/api.php (groupe des 6 permissions déjà au catalogue :
 * list / ajouter / modifier / archive / corbeille / supprimer).
 * Aucune permission n'a été créée : `restore` réutilise `archive`, conformément
 * à la convention du projet.
 */
class DataCenterController extends Controller
{
    /** Recherche + pagination côté serveur, comme la capture (Show N entries + Recherche). */
    public function index(Request $request)
    {
        $perPage = (int) $request->query('per_page', 10);
        if (! in_array($perPage, [10, 25, 50, 100], true)) {
            $perPage = 10;
        }

        $status = $request->query('status', 'actif');
        if (! in_array($status, ['actif', 'archive', 'corbeille'], true)) {
            $status = 'actif';
        }

        $search = trim((string) $request->query('search', ''));

        $query = DataCenterFiche::status($status);

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('denomination', 'like', "%{$search}%")
                    ->orWhere('ice', 'like', "%{$search}%")
                    ->orWhere('if', 'like', "%{$search}%")
                    ->orWhere('rc', 'like', "%{$search}%")
                    ->orWhere('tp', 'like', "%{$search}%");
            });
        }

        return $query->orderBy('denomination')->paginate($perPage)->withQueryString();
    }

    public function show(DataCenterFiche $fiche)
    {
        return $fiche;
    }

    public function store(StoreDataCenterFicheRequest $request)
    {
        $data = $request->validated();
        $data['created_by'] = $request->user()->id;

        $fiche = DataCenterFiche::create($data);

        // `status` a sa valeur par défaut ('actif') côté base : sans ce refresh
        // la réponse renverrait status = null au frontend.
        return response()->json($fiche->refresh(), 201);
    }

    public function update(UpdateDataCenterFicheRequest $request, DataCenterFiche $fiche)
    {
        $fiche->update($request->validated());

        return $fiche->fresh();
    }

    public function archive(DataCenterFiche $fiche)
    {
        $fiche->update(['status' => 'archive']);

        return $fiche->fresh();
    }

    public function corbeille(DataCenterFiche $fiche)
    {
        $fiche->update(['status' => 'corbeille']);

        return $fiche->fresh();
    }

    /** Restaurer = inverse d'archiver : même permission `archive`, convention du projet. */
    public function restore(DataCenterFiche $fiche)
    {
        $fiche->update(['status' => 'actif']);

        return $fiche->fresh();
    }

    /** « Suppression définitive » = soft delete, comme partout dans le projet. */
    public function destroy(DataCenterFiche $fiche)
    {
        if ($fiche->status !== 'corbeille') {
            return response()->json([
                'message' => 'Seule une fiche déjà placée dans la Corbeille peut être supprimée définitivement.',
            ], 422);
        }

        $fiche->delete();

        return response()->json(['message' => 'Fiche supprimée définitivement.']);
    }
}
