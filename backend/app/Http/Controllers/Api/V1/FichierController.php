<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Fichier;
use App\Rules\FichierAutorise;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Fichiers (page « Fichiers » + widget de la Topbar).
 * Ouvert à tout utilisateur connecté, comme le reste des outils de la Topbar (Notes, Calculatrice…) : pas de permission
 * dédiée, juste `auth:sanctum`. Chacun ne voit et ne supprime que SES fichiers ; l'administrateur garde l'accès à tous.
 */
class FichierController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();

        return Fichier::with('auteur')
            ->when(! $user->is_admin, fn ($q) => $q->where('created_by', $user->id))
            ->latest('id')->get()->map(fn ($f) => $this->format($f));
    }

    /** Accepte un ou plusieurs fichiers en une seule requête (`fichiers[]`). */
    public function store(Request $request)
    {
        $request->validate([
            'fichiers' => ['required', 'array', 'min:1'],
            'fichiers.*' => ['file', FichierAutorise::avecArchives(), 'max:20480'],
        ]);

        $crees = [];
        foreach ($request->file('fichiers') as $file) {
            $fichier = Fichier::create([
                'nom' => $file->getClientOriginalName(),
                'chemin' => $file->store('fichiers', 'public'),
                'mime' => $file->getClientMimeType(),
                'taille' => $file->getSize(),
                'created_by' => $request->user()->id,
            ]);
            $crees[] = $this->format($fichier->load('auteur'));
        }

        return response()->json($crees, 201);
    }

    public function destroy(Request $request, Fichier $fichier)
    {
        $user = $request->user();
        abort_unless($user->is_admin || (int) $fichier->created_by === (int) $user->id, 403, "Ce fichier appartient à un autre utilisateur.");

        Storage::disk('public')->delete($fichier->chemin);
        $fichier->delete();

        return response()->json(['message' => 'Fichier supprimé.']);
    }

    private function format(Fichier $f): array
    {
        return [
            'id' => $f->id,
            'nom' => $f->nom,
            'chemin' => $f->chemin,
            'mime' => $f->mime,
            'taille' => $f->taille,
            'addedBy' => $f->auteur->name ?? null,
            'addedAt' => optional($f->created_at)->toIso8601String(),
        ];
    }
}
