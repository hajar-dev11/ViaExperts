<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Rapport;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class RapportController extends Controller
{
    /** Permissions du groupe `rapports` (ajouté au catalogue après l'audit). */
    private function autoriser(Request $request, string $action): void
    {
        abort_unless($request->user()->hasPermission('rapports', $action), 403);
    }

    private function regles(bool $partiel = false): array
    {
        $r = $partiel ? 'sometimes' : 'required';

        return [
            'emetteur' => ['nullable', 'string', 'max:30'],
            'rapport_de' => ['nullable', 'string', 'max:150'],
            'date_rapport' => [$r, 'date'],
            'montant_restant' => ['nullable', 'numeric'],
            'revenu_local' => ['nullable', 'numeric'],
            'revenu_externe' => ['nullable', 'numeric'],
            'depense_jour' => ['nullable', 'numeric'],
            'solde_caisse' => ['nullable', 'numeric'],
            'descriptive' => ['nullable', 'string', 'max:10000'],
            // Un seul fichier : la capture indique d'utiliser une archive ZIP/RAR
            // pour transmettre plusieurs documents.
            'document' => ['nullable', 'file', 'max:20480'],
        ];
    }

    public function index(Request $request)
    {
        $this->autoriser($request, 'list');

        return Rapport::status($request->query('status', 'actif'))
            ->orderByDesc('date_rapport')
            ->orderByDesc('id')
            ->get()
            ->map(fn ($r) => $this->format($r));
    }

    public function show(Request $request, Rapport $rapport)
    {
        $this->autoriser($request, 'list');

        return $this->format($rapport);
    }

    public function store(Request $request)
    {
        $this->autoriser($request, 'ajouter');

        $data = $request->validate($this->regles());
        unset($data['document']);

        $data['created_by'] = $request->user()->id;

        if ($request->hasFile('document')) {
            $file = $request->file('document');
            $data['document_chemin'] = $file->store('rapports', 'public');
            $data['document_nom'] = $file->getClientOriginalName();
        }

        $rapport = Rapport::create($data);
        $rapport->refresh();
        $rapport->recalculerRevenu();

        return response()->json($this->format($rapport->fresh()), 201);
    }

    public function update(Request $request, Rapport $rapport)
    {
        $this->autoriser($request, 'modifier');

        $data = $request->validate($this->regles(true));
        unset($data['document']);

        if ($request->hasFile('document')) {
            if ($rapport->document_chemin) {
                Storage::disk('public')->delete($rapport->document_chemin);
            }
            $file = $request->file('document');
            $data['document_chemin'] = $file->store('rapports', 'public');
            $data['document_nom'] = $file->getClientOriginalName();
        }

        $rapport->update($data);
        $rapport->recalculerRevenu();

        return $this->format($rapport->fresh());
    }

    public function archive(Request $request, Rapport $rapport)
    {
        $this->autoriser($request, 'archive');
        $rapport->update(['status' => 'archive']);

        return $this->format($rapport->fresh());
    }

    public function corbeille(Request $request, Rapport $rapport)
    {
        $this->autoriser($request, 'corbeille');
        $rapport->update(['status' => 'corbeille']);

        return $this->format($rapport->fresh());
    }

    /** Restaurer = inverse d'archiver : même permission, convention du projet. */
    public function restore(Request $request, Rapport $rapport)
    {
        $this->autoriser($request, 'archive');
        $rapport->update(['status' => 'actif']);

        return $this->format($rapport->fresh());
    }

    public function destroy(Request $request, Rapport $rapport)
    {
        $this->autoriser($request, 'supprimer');

        if ($rapport->status !== 'corbeille') {
            return response()->json([
                'message' => 'Seul un rapport déjà placé dans la Corbeille peut être supprimé définitivement.',
            ], 422);
        }

        if ($rapport->document_chemin) {
            Storage::disk('public')->delete($rapport->document_chemin);
        }

        $rapport->delete();

        return response()->json(['message' => 'Rapport supprimé définitivement.']);
    }

    /** Téléchargement réel depuis le disque `public`. */
    public function telecharger(Request $request, Rapport $rapport)
    {
        $this->autoriser($request, 'list');

        abort_unless($rapport->document_chemin && Storage::disk('public')->exists($rapport->document_chemin), 404);

        return Storage::disk('public')->download($rapport->document_chemin, $rapport->document_nom);
    }

    private function format(Rapport $r): array
    {
        return [
            'id' => $r->id,
            'emetteur' => $r->emetteur,
            'rapportDe' => $r->rapport_de,
            'dateRapport' => optional($r->date_rapport)->toDateString(),
            'montantRestant' => $r->montant_restant,
            'revenuLocal' => $r->revenu_local,
            'revenuExterne' => $r->revenu_externe,
            'depenseJour' => $r->depense_jour,
            'soldeCaisse' => $r->solde_caisse,
            'totalRevenuJour' => $r->total_revenu_jour,
            'descriptive' => $r->descriptive,
            'documentNom' => $r->document_nom,
            'documentChemin' => $r->document_chemin,
            'status' => $r->status,
        ];
    }
}
