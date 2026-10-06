<?php

namespace App\Http\Controllers\Api\V1;
use App\Http\Controllers\Controller;
use App\Models\Cachet;
use App\Models\CachetOperation;
use App\Rules\FichierAutorise;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class CachetController extends Controller
{
    private const RELATIONS = ['client', 'entreprise', 'statut', 'operations.statut', 'operations.auteur'];

    /** Permissions du groupe `cashet` déjà présent au catalogue. */
    private function autoriser(Request $request, string $action): void
    {
        abort_unless($request->user()->hasPermission('cashet', $action), 403);
    }

    public function index(Request $request)
    {
        $this->autoriser($request, 'list');

        return Cachet::with(self::RELATIONS)
            ->status($request->query('status', 'actif'))
            ->orderByDesc('id')
            ->get()
            ->map(fn ($c) => $this->format($c));
    }

    /** Fil « Cashet Activité » : dernières opérations, tous cachets confondus. */
    public function activite(Request $request)
    {
        $this->autoriser($request, 'list');

        $limit = min((int) $request->query('limit', 15), 50);

        return CachetOperation::with(['statut', 'auteur'])
            ->latest('id')
            ->limit($limit)
            ->get()
            ->map(fn ($o) => [
                'id' => $o->id,
                'cachetId' => $o->cachet_id,
                'commentaire' => $o->commentaire,
                'statut' => $this->formatStatut($o->statut),
                'par' => $o->auteur->name ?? null,
                'fichierNom' => $o->fichier_nom,
                'fichierChemin' => $o->fichier_chemin,
                'createdAt' => optional($o->created_at)->toDateTimeString(),
            ]);
    }

    public function show(Request $request, Cachet $cachet)
    {
        $this->autoriser($request, 'list');

        return $this->format($cachet->load(self::RELATIONS));
    }

    public function store(Request $request)
    {
        $this->autoriser($request, 'ajouter');

        $data = $request->validate([
            'party_id' => ['required', 'integer', 'exists:parties,id'],
            'cachet_status_id' => ['nullable', 'integer', 'exists:cachet_statuses,id'],
            'lignes' => ['nullable', 'integer', 'min:0'],
            'date_depart' => ['required', 'date'],
        ]);

        $data['derniere_operation'] = $data['date_depart'];
        $data['created_by'] = $request->user()->id;

        $cachet = Cachet::create($data);
        $cachet->refresh();

        return response()->json($this->format($cachet->load(self::RELATIONS)), 201);
    }

    public function update(Request $request, Cachet $cachet)
    {
        $this->autoriser($request, 'modifier');

        $cachet->update($request->validate([
            'party_id' => ['sometimes', 'integer', 'exists:parties,id'],
            'cachet_status_id' => ['sometimes', 'nullable', 'integer', 'exists:cachet_statuses,id'],
            'lignes' => ['sometimes', 'integer', 'min:0'],
            'date_depart' => ['sometimes', 'date'],
        ]));

        return $this->format($cachet->load(self::RELATIONS));
    }

    /** Ajoute une opération : change le statut, met à jour « Dernière Opération », accepte un fichier. */
    public function storeOperation(Request $request, Cachet $cachet)
    {
        $this->autoriser($request, 'modifier');

        $request->validate([
            'cachet_status_id' => ['nullable', 'integer', 'exists:cachet_statuses,id'],
            'commentaire' => ['nullable', 'string', 'max:2000'],
            'fichier' => ['nullable', 'file', FichierAutorise::document(), 'max:5120'],
        ]);

        $operation = [
            'cachet_id' => $cachet->id,
            'cachet_status_id' => $request->input('cachet_status_id') ?: null,
            'commentaire' => $request->input('commentaire'),
            'created_by' => $request->user()->id,
        ];

        if ($request->hasFile('fichier')) {
            $file = $request->file('fichier');
            $operation['fichier_chemin'] = $file->store('cachets', 'public');
            $operation['fichier_nom'] = $file->getClientOriginalName();
        }

        CachetOperation::create($operation);

        $maj = ['derniere_operation' => now()];
        if ($operation['cachet_status_id']) {
            $maj['cachet_status_id'] = $operation['cachet_status_id'];
        }
        $cachet->update($maj);

        return $this->format($cachet->load(self::RELATIONS));
    }

    public function archive(Request $request, Cachet $cachet)
    {
        $this->autoriser($request, 'archive');
        $cachet->update(['status' => 'archive']);

        return $this->format($cachet->load(self::RELATIONS));
    }

    public function corbeille(Request $request, Cachet $cachet)
    {
        $this->autoriser($request, 'corbeille');
        $cachet->update(['status' => 'corbeille']);

        return $this->format($cachet->load(self::RELATIONS));
    }

    public function restore(Request $request, Cachet $cachet)
    {
        $this->autoriser($request, 'archive');
        $cachet->update(['status' => 'actif']);

        return $this->format($cachet->load(self::RELATIONS));
    }

    public function destroy(Request $request, Cachet $cachet)
    {
        $this->autoriser($request, 'supprimer');

        if ($cachet->status !== 'corbeille') {
            return response()->json([
                'message' => 'Seul un cachet déjà placé dans la Corbeille peut être supprimé définitivement.',
            ], 422);
        }

        foreach ($cachet->operations as $operation) {
            if ($operation->fichier_chemin) {
                Storage::disk('public')->delete($operation->fichier_chemin);
            }
        }

        $cachet->delete();

        return response()->json(['message' => 'Cachet supprimé définitivement.']);
    }

    private function formatStatut($statut): ?array
    {
        return $statut ? [
            'id' => $statut->id,
            'nom' => $statut->nom,
            'couleurTexte' => $statut->couleur_texte,
            'couleurFond' => $statut->couleur_fond,
        ] : null;
    }

    private function format(Cachet $c): array
    {
        return [
            'id' => $c->id,
            'partyId' => $c->party_id,
            'clientId' => $c->client->party_id ?? null,
            'entrepriseId' => $c->entreprise->party_id ?? null,
            'client' => $c->tiers_nom,
            'lignes' => $c->lignes,
            'statut' => $this->formatStatut($c->statut),
            'dateDepart' => optional($c->date_depart)->toDateTimeString(),
            'derniereOperation' => optional($c->derniere_operation)->toDateTimeString(),
            'status' => $c->status,
            'operations' => $c->relationLoaded('operations') ? $c->operations->map(fn ($o) => [
                'id' => $o->id,
                'commentaire' => $o->commentaire,
                'statut' => $this->formatStatut($o->statut),
                'par' => $o->auteur->name ?? null,
                'fichierNom' => $o->fichier_nom,
                'fichierChemin' => $o->fichier_chemin,
                'createdAt' => optional($o->created_at)->toDateTimeString(),
            ]) : [],
        ];
    }
}
