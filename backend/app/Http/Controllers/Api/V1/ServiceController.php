<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Service;
use Illuminate\Http\Request;

class ServiceController extends Controller
{
    public function index(Request $request)
    {
        return Service::status($request->query('status', 'actif'))
            ->orderByDesc('id')
            ->get();
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $data['created_by'] = $request->user()->id;

        // Prix du service : HT, enregistré avec ses centimes (104,17 reste 104,17). Seuls les totaux sont arrondis.

        // `status` a une valeur par défaut posée par la base : refresh pour la renvoyer.
        return Service::create($data)->refresh();
    }

    public function show(Service $service)
    {
        return $service;
    }

    public function update(Request $request, Service $service)
    {
        $data = $this->validated($request, true);

        // Prix HT enregistré avec ses centimes (aucun arrondi : seuls les totaux sont arrondis).

        $service->update($data);

        return $service->fresh();
    }

    public function archive(Service $service)
    {
        $service->update(['status' => 'archive']);

        return $service->fresh();
    }

    public function corbeille(Service $service)
    {
        $service->update(['status' => 'corbeille']);

        return $service->fresh();
    }

    public function restore(Service $service)
    {
        $service->update(['status' => 'actif']);

        return $service->fresh();
    }

    public function destroy(Service $service)
    {
        if ($service->status !== 'corbeille') {
            return response()->json([
                'message' => 'Seul un service déjà placé dans la Corbeille peut être supprimé définitivement.',
            ], 422);
        }

        $service->delete();

        return response()->json(['message' => 'Service supprimé définitivement.']);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $rule = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'nom' => [$rule, 'string', 'max:200'],
            'prix' => [$partial ? 'sometimes' : 'nullable', 'numeric', 'min:0'],
            'via_experts' => ['sometimes', 'boolean'],
            'maitre' => ['sometimes', 'nullable', 'string', 'max:150'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);
    }
}
