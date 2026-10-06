<?php

namespace App\Modules\Domiciliation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Domiciliation\Http\Requests\StoreCentreDomiciliationRequest;
use App\Modules\Domiciliation\Http\Requests\UpdateCentreDomiciliationRequest;
use App\Modules\Domiciliation\Models\CentreDomiciliation;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;

class CentreDomiciliationController extends Controller
{
    public function index(Request $request)
    {
        $perPage = (int) $request->query('per_page', 10);
        if (! in_array($perPage, [10, 25, 50, 100], true)) {
            $perPage = 10;
        }
        $search = trim((string) $request->query('search', ''));

        $status = $request->query('status', 'actif');
        if (! in_array($status, ['actif', 'archive', 'corbeille'], true)) {
            $status = 'actif';
        }

        $query = CentreDomiciliation::status($status);
        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('nom', 'like', "%{$search}%")
                    ->orWhere('ville', 'like', "%{$search}%")
                    ->orWhere('ice', 'like', "%{$search}%")
                    ->orWhere('if', 'like', "%{$search}%");
            });
        }

        return $query->orderBy('nom')->paginate($perPage)->withQueryString();
    }

    /** Fiche « Informations Centre de domiciliation » : le centre + les entreprises qui y sont domiciliées. */
    public function show(CentreDomiciliation $centre)
    {
        $centre->load(['domiciliations' => function ($query) {
            $query->with('entreprise')->orderByDesc('date_depart');
        }]);

        return $centre;
    }

    public function store(StoreCentreDomiciliationRequest $request)
    {
        $centre = CentreDomiciliation::create($request->validated());

        return response()->json($centre, 201);
    }

    public function update(UpdateCentreDomiciliationRequest $request, CentreDomiciliation $centre)
    {
        $centre->update($request->validated());

        return $centre->fresh();
    }

    public function archive(CentreDomiciliation $centre)
    {
        $centre->update(['status' => 'archive']);

        return $centre->fresh();
    }

    public function corbeille(CentreDomiciliation $centre)
    {
        $centre->update(['status' => 'corbeille']);

        return $centre->fresh();
    }

    /** Restaurer = inverse d'archiver/mettre à la corbeille, même permission `archive_centres`. */
    public function restore(CentreDomiciliation $centre)
    {
        $centre->update(['status' => 'actif']);

        return $centre->fresh();
    }

    /** « Suppression définitive » = soft delete, uniquement depuis la Corbeille, comme partout ailleurs. */
    public function destroy(CentreDomiciliation $centre)
    {
        if ($centre->status !== 'corbeille') {
            return response()->json([
                'message' => 'Seul un centre déjà placé dans la Corbeille peut être supprimé définitivement.',
            ], 422);
        }

        try {
            $centre->delete();
        } catch (QueryException $e) {
            return response()->json([
                'message' => 'Ce centre est utilisé par au moins une entreprise : suppression impossible.',
            ], 422);
        }

        return response()->json(['message' => 'Centre supprimé définitivement.']);
    }
}
