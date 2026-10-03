<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ChatMessage;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ChatController extends Controller
{
    /** Permissions du groupe `chat` (ajouté au catalogue après l'audit). */
    private function autoriser(Request $request, string $action): void
    {
        abort_unless($request->user()->hasPermission('chat', $action), 403);
    }

    /** Forme JSON commune à `messages()`, `send()` et `update()`. */
    private function mapMessage(ChatMessage $m, int $me): array
    {
        return [
            'id' => $m->id,
            'body' => $m->body,
            'mine' => $m->sender_id === $me,
            'senderId' => $m->sender_id,
            'fichierNom' => $m->fichier_nom,
            'fichierChemin' => $m->fichier_chemin,
            'createdAt' => optional($m->created_at)->toDateTimeString(),
            'readAt' => optional($m->read_at)->toDateTimeString(),
        ];
    }

    /**
     * Contacts du chat interne = tous les autres utilisateurs de l'application,
     * avec le dernier message échangé et le nombre de non-lus.
     */
    public function contacts(Request $request)
    {
        $this->autoriser($request, 'list');

        $me = $request->user()->id;

        $users = User::where('id', '!=', $me)->orderBy('name')->get(['id', 'name', 'email', 'fonction', 'photo_path']);

        $nonLus = ChatMessage::where('recipient_id', $me)
            ->whereNull('read_at')
            ->select('sender_id', DB::raw('COUNT(*) as total'))
            ->groupBy('sender_id')
            ->pluck('total', 'sender_id');

        return $users->map(function ($u) use ($me, $nonLus) {
            $dernier = ChatMessage::conversation($me, $u->id)->latest('id')->first();

            return [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'fonction' => $u->fonction,
                'photoPath' => $u->photo_path,
                'dernierMessage' => $dernier?->body,
                'dernierMessageAt' => optional($dernier?->created_at)->toDateTimeString(),
                'nonLus' => (int) ($nonLus[$u->id] ?? 0),
            ];
        });
    }

    /** Conversation avec un utilisateur : marque au passage ses messages comme lus. */
    public function messages(Request $request, User $user)
    {
        $this->autoriser($request, 'list');

        $me = $request->user()->id;
        abort_if($user->id === $me, 422, 'Impossible de discuter avec soi-même.');

        ChatMessage::where('sender_id', $user->id)
            ->where('recipient_id', $me)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return ChatMessage::conversation($me, $user->id)
            ->orderBy('id')
            ->get()
            ->map(fn ($m) => $this->mapMessage($m, $me));
    }

    /** Envoie un message texte, un fichier joint, ou les deux à la fois. */
    public function send(Request $request, User $user)
    {
        $this->autoriser($request, 'envoyer');

        $me = $request->user()->id;
        abort_if($user->id === $me, 422, 'Impossible de discuter avec soi-même.');

        $data = $request->validate([
            'body' => ['nullable', 'string', 'max:5000'],
            // 20 Mo — le php.ini de la machine autorise jusqu'à 40 Mo par requête.
            'fichier' => ['nullable', 'file', 'max:20480'],
        ]);

        $fichier = $request->file('fichier');
        abort_if(empty($data['body']) && ! $fichier, 422, 'Un message ou un fichier est requis.');

        $message = ChatMessage::create([
            'sender_id' => $me,
            'recipient_id' => $user->id,
            'body' => $data['body'] ?? null,
            'fichier_nom' => $fichier?->getClientOriginalName(),
            'fichier_chemin' => $fichier?->store('chat', 'public'),
            'fichier_mime' => $fichier?->getClientMimeType(),
            'fichier_taille' => $fichier?->getSize(),
        ]);

        return response()->json($this->mapMessage($message, $me), 201);
    }

    /** Modifier son propre message (texte uniquement). */
    public function update(Request $request, ChatMessage $message)
    {
        $this->autoriser($request, 'modifier');

        $me = $request->user()->id;
        abort_unless($message->sender_id === $me, 403, "Vous ne pouvez modifier que vos propres messages.");

        $data = $request->validate(['body' => ['required', 'string', 'max:5000']]);
        $message->update(['body' => $data['body']]);

        return $this->mapMessage($message->fresh(), $me);
    }

    /** Supprimer son propre message. */
    public function destroy(Request $request, ChatMessage $message)
    {
        $this->autoriser($request, 'supprimer');

        $me = $request->user()->id;
        abort_unless($message->sender_id === $me, 403, "Vous ne pouvez supprimer que vos propres messages.");

        $message->delete();

        return response()->json(['message' => 'Message supprimé.']);
    }
}
