<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Note;
use Illuminate\Http\Request;

/**
 * Notes personnelles (page « Notes » + widget de la Topbar).
 * Ouvert à tout utilisateur connecté (pas de permission dédiée, juste `auth:sanctum`), mais PERSONNEL : chacun ne lit, ne
 * modifie et ne supprime que ses propres notes. L'administrateur garde l'accès à toutes les notes.
 */
class NoteController extends Controller
{
    /** Une note n'est accessible qu'à son auteur (ou à un administrateur). */
    private function autoriser(Request $request, Note $note): void
    {
        $user = $request->user();

        abort_unless($user->is_admin || (int) $note->created_by === (int) $user->id, 403, "Cette note appartient à un autre utilisateur.");
    }

    public function index(Request $request)
    {
        $user = $request->user();

        return Note::with('auteur')
            ->when(! $user->is_admin, fn ($q) => $q->where('created_by', $user->id))
            ->latest('updated_at')->get()->map(fn ($n) => $this->format($n));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'titre' => ['nullable', 'string', 'max:255'],
            'contenu' => ['nullable', 'string'],
        ]);

        $data['created_by'] = $request->user()->id;
        $note = Note::create($data);

        return response()->json($this->format($note->load('auteur')), 201);
    }

    public function update(Request $request, Note $note)
    {
        $this->autoriser($request, $note);

        $note->update($request->validate([
            'titre' => ['sometimes', 'nullable', 'string', 'max:255'],
            'contenu' => ['sometimes', 'nullable', 'string'],
        ]));

        return $this->format($note->fresh('auteur'));
    }

    public function destroy(Request $request, Note $note)
    {
        $this->autoriser($request, $note);

        $note->delete();

        return response()->json(['message' => 'Note supprimée.']);
    }

    private function format(Note $n): array
    {
        return [
            'id' => $n->id,
            'titre' => $n->titre,
            'contenu' => $n->contenu,
            'addedBy' => $n->auteur->name ?? null,
            'createdAt' => optional($n->created_at)->toIso8601String(),
            'updatedAt' => optional($n->updated_at)->toIso8601String(),
        ];
    }
}
