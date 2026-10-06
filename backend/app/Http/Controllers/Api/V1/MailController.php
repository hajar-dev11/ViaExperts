<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Mail;
use App\Models\MailOperation;
use App\Rules\FichierAutorise;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class MailController extends Controller
{
    private const RELATIONS = ['client', 'entreprise', 'statut', 'operations.statut', 'operations.auteur'];

    /** Permissions du groupe `mails` déjà présent au catalogue. */
    private function autoriser(Request $request, string $action): void
    {
        abort_unless($request->user()->hasPermission('mails', $action), 403);
    }

    public function index(Request $request)
    {
        $this->autoriser($request, 'list');

        return Mail::with(self::RELATIONS)
            ->status($request->query('status', 'actif'))
            ->orderByDesc('id')
            ->get()
            ->map(fn ($m) => $this->format($m));
    }

    /** Fil « Mail Activité » : dernières opérations, tous mails confondus. */
    public function activite(Request $request)
    {
        $this->autoriser($request, 'list');

        $limit = min((int) $request->query('limit', 15), 50);

        return MailOperation::with(['statut', 'auteur'])
            ->latest('id')
            ->limit($limit)
            ->get()
            ->map(fn ($o) => [
                'id' => $o->id,
                'mailId' => $o->mail_id,
                'commentaire' => $o->commentaire,
                'statut' => $this->formatStatut($o->statut),
                'par' => $o->auteur->name ?? null,
                'fichierNom' => $o->fichier_nom,
                'fichierChemin' => $o->fichier_chemin,
                'createdAt' => optional($o->created_at)->toDateTimeString(),
            ]);
    }

    public function show(Request $request, Mail $mail)
    {
        $this->autoriser($request, 'list');

        return $this->format($mail->load(self::RELATIONS));
    }

    public function store(Request $request)
    {
        $this->autoriser($request, 'ajouter');

        $data = $request->validate([
            'party_id' => ['required', 'integer', 'exists:parties,id'],
            'mail_status_id' => ['nullable', 'integer', 'exists:mail_statuses,id'],
            'date_depart' => ['required', 'date'],
            'observation' => ['nullable', 'string', 'max:500'],
        ]);

        $data['derniere_operation'] = $data['date_depart'];
        $data['created_by'] = $request->user()->id;

        $mail = Mail::create($data);
        $mail->refresh();

        return response()->json($this->format($mail->load(self::RELATIONS)), 201);
    }

    public function update(Request $request, Mail $mail)
    {
        $this->autoriser($request, 'modifier');

        $mail->update($request->validate([
            'party_id' => ['sometimes', 'integer', 'exists:parties,id'],
            'mail_status_id' => ['sometimes', 'nullable', 'integer', 'exists:mail_statuses,id'],
            'date_depart' => ['sometimes', 'date'],
            'observation' => ['sometimes', 'nullable', 'string', 'max:500'],
        ]));

        return $this->format($mail->load(self::RELATIONS));
    }

    /** Ajoute une opération : change le statut et met à jour « Dernière Opération ». */
    public function storeOperation(Request $request, Mail $mail)
    {
        $this->autoriser($request, 'modifier');

        $request->validate([
            'mail_status_id' => ['nullable', 'integer', 'exists:mail_statuses,id'],
            'commentaire' => ['nullable', 'string', 'max:2000'],
            'fichier' => ['nullable', 'file', FichierAutorise::document(), 'max:5120'],
        ]);

        $operation = [
            'mail_id' => $mail->id,
            'mail_status_id' => $request->input('mail_status_id') ?: null,
            'commentaire' => $request->input('commentaire'),
            'created_by' => $request->user()->id,
        ];

        if ($request->hasFile('fichier')) {
            $file = $request->file('fichier');
            $operation['fichier_chemin'] = $file->store('mails', 'public');
            $operation['fichier_nom'] = $file->getClientOriginalName();
        }

        MailOperation::create($operation);

        $maj = ['derniere_operation' => now()];
        if ($operation['mail_status_id']) {
            $maj['mail_status_id'] = $operation['mail_status_id'];
        }
        $mail->update($maj);

        return $this->format($mail->load(self::RELATIONS));
    }

    public function archive(Request $request, Mail $mail)
    {
        $this->autoriser($request, 'archive');
        $mail->update(['status' => 'archive']);

        return $this->format($mail->load(self::RELATIONS));
    }

    public function corbeille(Request $request, Mail $mail)
    {
        $this->autoriser($request, 'corbeille');
        $mail->update(['status' => 'corbeille']);

        return $this->format($mail->load(self::RELATIONS));
    }

    public function restore(Request $request, Mail $mail)
    {
        $this->autoriser($request, 'archive');
        $mail->update(['status' => 'actif']);

        return $this->format($mail->load(self::RELATIONS));
    }

    public function destroy(Request $request, Mail $mail)
    {
        $this->autoriser($request, 'supprimer');

        if ($mail->status !== 'corbeille') {
            return response()->json([
                'message' => 'Seul un mail déjà placé dans la Corbeille peut être supprimé définitivement.',
            ], 422);
        }

        foreach ($mail->operations as $operation) {
            if ($operation->fichier_chemin) {
                Storage::disk('public')->delete($operation->fichier_chemin);
            }
        }

        $mail->delete();

        return response()->json(['message' => 'Mail supprimé définitivement.']);
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

    private function format(Mail $m): array
    {
        return [
            'id' => $m->id,
            'partyId' => $m->party_id,
            'clientId' => $m->client->party_id ?? null,
            'entrepriseId' => $m->entreprise->party_id ?? null,
            'client' => $m->tiers_nom,
            'statut' => $this->formatStatut($m->statut),
            'dateDepart' => optional($m->date_depart)->toDateTimeString(),
            'derniereOperation' => optional($m->derniere_operation)->toDateTimeString(),
            'observation' => $m->observation,
            'status' => $m->status,
            'operations' => $m->relationLoaded('operations') ? $m->operations->map(fn ($o) => [
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
