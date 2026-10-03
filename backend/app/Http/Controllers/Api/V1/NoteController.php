<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Note;
use Illuminate\Http\Request;

/**
 * Notes personnelles (page « Notes » + widget de la Topbar).
 * Ouvert à tout utilisateur connecté, comme le reste des outils de la
 * Topbar : pas de permission dédiée, juste `auth:sanctum`.
 */
class NoteController extends Controller
{
    public function index()
    {
        return Note::with('auteur')->latest('updated_at')->get()->map(fn ($n) => $this->format($n));
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
        $note->update($request->validate([
            'titre' => ['sometimes', 'nullable', 'string', 'max:255'],
            'contenu' => ['sometimes', 'nullable', 'string'],
        ]));

        return $this->format($note->fresh('auteur'));
    }

    public function destroy(Note $note)
    {
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
