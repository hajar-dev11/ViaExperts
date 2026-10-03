<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCachetStatusRequest;
use App\Http\Requests\UpdateCachetStatusRequest;
use App\Models\CachetStatus;
use Illuminate\Http\Request;

class CachetStatusController extends Controller
{
    public function index(Request $request)
    {
        $perPage = (int) $request->query('per_page', 10);
        if (! in_array($perPage, [10, 25, 50, 100], true)) {
            $perPage = 10;
        }
        $search = trim((string) $request->query('search', ''));

        $query = CachetStatus::query();
        if ($search !== '') {
            $query->where('nom', 'like', "%{$search}%");
        }

        return $query->orderBy('nom')->paginate($perPage)->withQueryString();
    }

    public function store(StoreCachetStatusRequest $request)
    {
        return response()->json(CachetStatus::create($request->validated()), 201);
    }

    public function update(UpdateCachetStatusRequest $request, CachetStatus $cachetStatus)
    {
        $cachetStatus->update($request->validated());

        return $cachetStatus->fresh();
    }

    public function destroy(CachetStatus $cachetStatus)
    {
        $cachetStatus->delete();

        return response()->json(['message' => 'Statut supprimé.']);
    }
}
