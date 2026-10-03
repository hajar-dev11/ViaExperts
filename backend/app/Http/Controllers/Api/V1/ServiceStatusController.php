<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreServiceStatusRequest;
use App\Http\Requests\UpdateServiceStatusRequest;
use App\Models\ServiceStatus;
use Illuminate\Http\Request;

class ServiceStatusController extends Controller
{
    public function index(Request $request)
    {
        $perPage = (int) $request->query('per_page', 10);
        if (! in_array($perPage, [10, 25, 50, 100], true)) {
            $perPage = 10;
        }
        $search = trim((string) $request->query('search', ''));

        $query = ServiceStatus::query();
        if ($search !== '') {
            $query->where('nom', 'like', "%{$search}%");
        }

        return $query->orderBy('nom')->paginate($perPage)->withQueryString();
    }

    public function store(StoreServiceStatusRequest $request)
    {
        $status = ServiceStatus::create($request->validated());

        return response()->json($status, 201);
    }

    public function update(UpdateServiceStatusRequest $request, ServiceStatus $serviceStatus)
    {
        $serviceStatus->update($request->validated());

        return $serviceStatus->fresh();
    }

    public function destroy(ServiceStatus $serviceStatus)
    {
        $serviceStatus->delete();

        return response()->json(['message' => 'Statut supprimé.']);
    }
}
