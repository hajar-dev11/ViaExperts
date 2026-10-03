<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMailStatusRequest;
use App\Http\Requests\UpdateMailStatusRequest;
use App\Models\MailStatus;
use Illuminate\Http\Request;

class MailStatusController extends Controller
{
    public function index(Request $request)
    {
        $perPage = (int) $request->query('per_page', 10);
        if (! in_array($perPage, [10, 25, 50, 100], true)) {
            $perPage = 10;
        }
        $search = trim((string) $request->query('search', ''));

        $query = MailStatus::query();
        if ($search !== '') {
            $query->where('nom', 'like', "%{$search}%");
        }

        return $query->orderBy('nom')->paginate($perPage)->withQueryString();
    }

    public function store(StoreMailStatusRequest $request)
    {
        return response()->json(MailStatus::create($request->validated()), 201);
    }

    public function update(UpdateMailStatusRequest $request, MailStatus $mailStatus)
    {
        $mailStatus->update($request->validated());

        return $mailStatus->fresh();
    }

    public function destroy(MailStatus $mailStatus)
    {
        $mailStatus->delete();

        return response()->json(['message' => 'Statut supprimé.']);
    }
}
