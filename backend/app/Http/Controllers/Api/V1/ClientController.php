<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreClientRequest;
use App\Http\Requests\UpdateClientRequest;
use App\Http\Resources\ClientResource;
use App\Models\Client;
use App\Models\Party;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ClientController extends Controller
{
    public function index(Request $request)
    {
        $status = $request->query('status', 'actif');

        $clients = Client::withStatus($status)
            ->with('party.auteur')
            ->orderByDesc('party_id')
            ->get();

        return ClientResource::collection($clients);
    }

    public function store(StoreClientRequest $request)
    {
        $data = $request->validated();

        $client = DB::transaction(function () use ($data, $request) {
            $party = Party::create(['type' => 'client', 'status' => 'actif', 'created_by' => $request->user()->id]);

            return Client::create([
                'party_id' => $party->id,
                'type' => 'client',
                'genre' => $data['genre'],
                'nom' => $data['nom'],
                'nom_ar' => $data['nomAr'] ?? null,
                'nationalite' => $data['nationalite'] ?? 'MAROCAINE',
                'date_naissance' => $data['naissance'] ?? null,
                'cin' => $data['cin'] ?? null,
                'email' => $data['email'] ?? null,
                'telephone' => $data['tel'] ?? null,
                'telephone_2' => $data['tel2'] ?? null,
                'adresse' => $data['adresse'] ?? null,
                'adresse_ar' => $data['adresseAr'] ?? null,
            ]);
        });

        return new ClientResource($client->load('party.auteur'));
    }

    public function show(Client $client)
    {
        abort_if(! $client->party, 404);

        return new ClientResource($client->load('party.auteur', 'entreprises.centreDomiciliation'));
    }

    public function update(UpdateClientRequest $request, Client $client)
    {
        abort_if(! $client->party, 404);

        $data = $request->validated();

        $map = [
            'genre' => 'genre', 'nom' => 'nom', 'nomAr' => 'nom_ar', 'nationalite' => 'nationalite',
            'naissance' => 'date_naissance', 'cin' => 'cin', 'email' => 'email',
            'tel' => 'telephone', 'tel2' => 'telephone_2', 'adresse' => 'adresse', 'adresseAr' => 'adresse_ar',
        ];

        $update = [];
        foreach ($map as $input => $column) {
            if (array_key_exists($input, $data)) {
                $update[$column] = $data[$input];
            }
        }

        $client->update($update);

        return new ClientResource($client->load('party.auteur'));
    }

    public function archive(Client $client)
    {
        abort_if(! $client->party, 404);
        $client->party->update(['status' => 'archive']);

        return new ClientResource($client->load('party.auteur'));
    }

    public function corbeille(Client $client)
    {
        abort_if(! $client->party, 404);
        $client->party->update(['status' => 'corbeille']);

        return new ClientResource($client->load('party.auteur'));
    }

    public function restore(Client $client)
    {
        abort_if(! $client->party, 404);
        $client->party->update(['status' => 'actif']);

        return new ClientResource($client->load('party.auteur'));
    }

    public function destroy(Client $client)
    {
        abort_if(! $client->party, 404);

        if ($client->party->status !== 'corbeille') {
            return response()->json([
                'message' => 'Seul un client déjà placé dans la Corbeille peut être supprimé définitivement.',
            ], 422);
        }

        $client->party->delete();

        return response()->json(['message' => 'Client supprimé définitivement.']);
    }
}
