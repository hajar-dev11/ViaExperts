<?php

namespace App\Http\Controllers\Api\V1;

use App\Contracts\ServicesEnCours\AssureServicesEnCours;
use App\Http\Controllers\Controller;
use App\Http\Resources\DeclarationTvaResource;
use App\Models\DeclarationTva;
use App\Models\DeclarationTvaLigne;
use App\Models\Entreprise;
use App\Support\ZipSimple;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DeclarationTvaController extends Controller
{
    private const RELATIONS = ['lignes', 'entreprise'];

    public function __construct(private AssureServicesEnCours $servicesEnCours)
    {
    }

    /**
     * `type` = tva | chiffre_affaire ; chacun a son propre groupe de permissions
     * dans le catalogue (`declaration` et `chiffre_affaire`).
     */
    private function autoriser(Request $request, string $action, string $type): void
    {
        $module = DeclarationTva::MODULES[$type] ?? abort(404);

        abort_unless($request->user()->hasPermission($module, $action), 403);
    }

    private function regles(bool $partiel = false): array
    {
        $r = $partiel ? 'sometimes' : 'required';

        return [
            'entreprise_id' => [$r, 'integer', 'exists:entreprises,party_id'],
            'client_if' => [$r, 'string', 'max:30'],
            'identifiant_paiement' => ['nullable', 'string', 'max:40'],
            'periode_type' => ['nullable', 'in:trimestre,mois'],
            'periode_valeur' => [$r, 'integer', 'min:1', 'max:12'],
            'annee' => [$r, 'integer', 'min:2000', 'max:2100'],
            'regime' => ['nullable', 'string', 'max:40'],
            'situation' => ['nullable', 'in:declaree,non_declaree'],

            'lignes' => [$partiel ? 'sometimes' : 'required', 'array', 'min:1'],
            'lignes.*.ordre_ref' => ['nullable', 'string', 'max:30'],
            'lignes.*.fact_num' => ['nullable', 'string', 'max:60'],
            'lignes.*.designation' => ['nullable', 'string', 'max:255'],
            'lignes.*.ht' => ['required_with:lignes', 'numeric'],
            'lignes.*.tva' => ['required_with:lignes', 'numeric'],
            'lignes.*.ttc' => ['required_with:lignes', 'numeric'],
            'lignes.*.identifiant_fiscal' => ['nullable', 'string', 'max:30'],
            'lignes.*.libelle_fournisseur' => ['nullable', 'string', 'max:200'],
            'lignes.*.ice' => ['nullable', 'string', 'max:30'],
            'lignes.*.taux' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'lignes.*.id_paie' => ['nullable', 'string', 'max:40'],
            'lignes.*.date_paie' => ['nullable', 'date'],
            'lignes.*.date_fac' => ['nullable', 'date'],
        ];
    }

    public function index(Request $request, string $type)
    {
        $this->autoriser($request, 'liste', $type);

        $query = DeclarationTva::with(self::RELATIONS)
            ->type($type)
            ->status($request->query('status', 'actif'));

        if ($situation = $request->query('situation')) {
            $query->where('situation', $situation);
        }

        return DeclarationTvaResource::collection($query->orderByDesc('id')->get());
    }

    /**
     * Factures DÉJÀ ENREGISTRÉES portant l'un des numéros donnés : sert à signaler visuellement (fond rouge) un numéro de
     * facture saisi deux fois pour le même fournisseur. Avertissement seulement : rien n'est bloqué, ni modifié, ni fusionné.
     *
     * Périmètre : même type (Déclaration TVA ou Chiffre d'Affaire) ET même entreprise, déclarations actives. `exclure` écarte
     * la déclaration en cours de modification (ses propres lignes ne sont pas des doublons d'elles-mêmes). Les numéros sont
     * comparés sans tenir compte de la casse ni des espaces ; le rapprochement par FOURNISSEUR (IF, ICE, libellé) se fait côté
     * interface, avec la même règle que pour les doublons dans le tableau affiché.
     */
    public function facturesExistantes(Request $request, string $type)
    {
        $this->autoriser($request, 'liste', $type);

        $data = $request->validate([
            'entreprise_id' => ['required', 'integer'],
            'numeros' => ['required', 'array', 'max:500'],
            'numeros.*' => ['nullable', 'string', 'max:60'],
            'exclure' => ['nullable', 'integer'],
        ]);

        $numeros = collect($data['numeros'])
            ->map(fn ($numero) => strtoupper(preg_replace('/\s+/u', '', (string) $numero)))
            ->filter()
            ->unique()
            ->values();

        if ($numeros->isEmpty()) {
            return response()->json([]);
        }

        $declarations = DeclarationTva::query()
            ->type($type)
            ->status('actif')
            ->where('entreprise_id', $data['entreprise_id'])
            ->when($data['exclure'] ?? null, fn ($q, $id) => $q->whereKeyNot($id))
            ->select('id');

        $lignes = DeclarationTvaLigne::query()
            ->whereIn('declaration_id', $declarations)
            ->whereIn(DB::raw("UPPER(REPLACE(TRIM(fact_num), ' ', ''))"), $numeros->all())
            ->get(['declaration_id', 'fact_num', 'identifiant_fiscal', 'ice', 'libelle_fournisseur']);

        return response()->json($lignes->map(fn ($l) => [
            'declarationId' => $l->declaration_id,
            'factNum' => $l->fact_num,
            'identifiantFiscal' => $l->identifiant_fiscal,
            'ice' => $l->ice,
            'libelleFournisseur' => $l->libelle_fournisseur,
        ])->values());
    }

    /**
     * Règlements EN ESPÈCES déjà enregistrés pour l'entreprise, le type (Déclaration TVA ou Chiffre d'Affaire) et l'ANNÉE donnés :
     * une ligne par facture réglée en espèces, avec son TTC et l'identité du tiers (IF, ICE, libellé). Sert à l'avertissement
     * « le cumul des espèces de ce tiers dépasse 5 000 Dh » (le calcul et le rapprochement par tiers se font côté interface, avec
     * la même règle que pour le tableau affiché). Lecture seule : aucun blocage, rien n'est modifié.
     *
     * Une ligne est « en espèces » quand son ID PAIE — à défaut l'identifiant de paiement de sa déclaration — contient « ESPECE ».
     * Périmètre : même type (un client n'est jamais cumulé avec un fournisseur), même entreprise (c'est elle qui paie), même
     * année, déclarations actives. `exclure` écarte la déclaration en cours de modification (ses lignes sont dans le tableau).
     */
    public function especesExistantes(Request $request, string $type)
    {
        $this->autoriser($request, 'liste', $type);

        $data = $request->validate([
            'entreprise_id' => ['required', 'integer'],
            'annee' => ['required', 'integer', 'min:2000', 'max:2100'],
            'exclure' => ['nullable', 'integer'],
        ]);

        $declarations = DeclarationTva::query()
            ->type($type)
            ->status('actif')
            ->where('entreprise_id', $data['entreprise_id'])
            ->where('annee', $data['annee'])
            ->when($data['exclure'] ?? null, fn ($q, $id) => $q->whereKeyNot($id))
            ->pluck('identifiant_paiement', 'id');

        if ($declarations->isEmpty()) {
            return response()->json([]);
        }

        $especes = fn (?string $mode) => str_contains(strtoupper((string) $mode), 'ESPECE');

        $lignes = DeclarationTvaLigne::query()
            ->whereIn('declaration_id', $declarations->keys())
            ->limit(5000)
            ->get(['declaration_id', 'fact_num', 'identifiant_fiscal', 'ice', 'libelle_fournisseur', 'ttc', 'id_paie'])
            ->filter(fn ($l) => $especes(trim((string) $l->id_paie) !== '' ? $l->id_paie : $declarations[$l->declaration_id]))
            ->map(fn ($l) => [
                'declarationId' => $l->declaration_id,
                'factNum' => $l->fact_num,
                'identifiantFiscal' => $l->identifiant_fiscal,
                'ice' => $l->ice,
                'libelleFournisseur' => $l->libelle_fournisseur,
                'ttc' => $l->ttc,
            ])
            ->values();

        return response()->json($lignes);
    }

    public function show(Request $request, string $type, DeclarationTva $declaration)
    {
        $this->autoriser($request, 'liste', $type);
        abort_if($declaration->type !== $type, 404);

        return new DeclarationTvaResource($declaration->load(self::RELATIONS));
    }

    public function store(Request $request, string $type)
    {
        $this->autoriser($request, 'ajouter', $type);

        $data = $request->validate($this->regles());
        $lignes = $data['lignes'];
        unset($data['lignes']);

        // Les 2 boutons de sauvegarde de la référence portent chacun leur permission.
        $situation = $data['situation'] ?? 'non_declaree';
        $this->autoriser($request, $situation === 'declaree' ? 'sauvegarder_declaree' : 'sauvegarder_non_declare', $type);

        $declaration = DB::transaction(function () use ($data, $lignes, $situation, $type, $request) {
            $declaration = DeclarationTva::create($data + [
                'type' => $type,
                'situation' => $situation,
                'created_by' => $request->user()->id,
            ]);

            foreach (array_values($lignes) as $ordre => $ligne) {
                $declaration->lignes()->create($ligne + ['ordre' => $ordre]);
            }

            $declaration->load('lignes');
            $declaration->recalculerTotaux();

            // La Déclaration TVA est elle-même un service du catalogue (voir
            // ServiceCatalogueSeeder) : déposer une déclaration doit donc faire
            // apparaître automatiquement ce service dans « Services en cours »
            // pour le client titulaire de l'entreprise concernée. `chiffre_affaire`
            // n'est pas concerné — seul `tva` a été demandé.
            if ($type === 'tva') {
                $clientId = Entreprise::where('party_id', $data['entreprise_id'])->value('client_id');
                $this->servicesEnCours->assurerPourClient('Déclaration TVA', $clientId, $request->user()->id, ['type' => 'declaration_tva', 'id' => $declaration->id]);
            }

            return $declaration;
        });

        return (new DeclarationTvaResource($declaration->fresh(self::RELATIONS)))
            ->response()
            ->setStatusCode(201);
    }

    public function update(Request $request, string $type, DeclarationTva $declaration)
    {
        $this->autoriser($request, 'modifier', $type);
        abort_if($declaration->type !== $type, 404);

        $data = $request->validate($this->regles(true));
        $lignes = $data['lignes'] ?? null;
        unset($data['lignes']);

        if (isset($data['situation'])) {
            $this->autoriser($request, $data['situation'] === 'declaree' ? 'sauvegarder_declaree' : 'sauvegarder_non_declare', $type);
        }

        DB::transaction(function () use ($declaration, $data, $lignes) {
            $declaration->update($data);

            if ($lignes !== null) {
                $declaration->lignes()->delete();
                foreach (array_values($lignes) as $ordre => $ligne) {
                    $declaration->lignes()->create($ligne + ['ordre' => $ordre]);
                }
            }

            $declaration->load('lignes');
            $declaration->recalculerTotaux();
        });

        return new DeclarationTvaResource($declaration->fresh(self::RELATIONS));
    }

    public function archive(Request $request, string $type, DeclarationTva $declaration)
    {
        $this->autoriser($request, 'archive', $type);
        $declaration->update(['status' => 'archive']);

        return new DeclarationTvaResource($declaration->load(self::RELATIONS));
    }

    public function corbeille(Request $request, string $type, DeclarationTva $declaration)
    {
        $this->autoriser($request, 'corbeille', $type);
        $declaration->update(['status' => 'corbeille']);

        return new DeclarationTvaResource($declaration->load(self::RELATIONS));
    }

    public function restore(Request $request, string $type, DeclarationTva $declaration)
    {
        $this->autoriser($request, 'archive', $type);
        $declaration->update(['status' => 'actif']);

        return new DeclarationTvaResource($declaration->load(self::RELATIONS));
    }

    public function destroy(Request $request, string $type, DeclarationTva $declaration)
    {
        $this->autoriser($request, 'supprimer', $type);

        if ($declaration->status !== 'corbeille') {
            return response()->json([
                'message' => 'Seule une déclaration déjà placée dans la Corbeille peut être supprimée définitivement.',
            ], 422);
        }

        $declaration->delete();

        return response()->json(['message' => 'Déclaration supprimée définitivement.']);
    }

    /**
     * Exports réels des 3 boutons de la capture.
     * format : xml | xls | zip (le ZIP contient les deux précédents).
     */
    public function export(Request $request, string $type, DeclarationTva $declaration, string $format)
    {
        // Le groupe `chiffre_affaire` ne prévoit que l'export Excel : ZIP/XML y sont
        // donc indisponibles, conformément au catalogue de permissions.
        $permissions = ['xml' => 'exporter_xml', 'xls' => 'exporter_excel', 'zip' => 'exporter_zip'];
        abort_unless(isset($permissions[$format]), 404);
        abort_if($type === 'chiffre_affaire' && $format !== 'xls', 404);
        $this->autoriser($request, $permissions[$format], $type);
        abort_if($declaration->type !== $type, 404);

        $declaration->load(self::RELATIONS);
        $base = ($type === 'tva' ? 'declaration-tva-' : 'chiffre-affaire-').$declaration->id;

        if ($format === 'xml') {
            return response($this->versXml($declaration), 200, [
                'Content-Type' => 'application/xml',
                'Content-Disposition' => "attachment; filename=\"{$base}.xml\"",
            ]);
        }

        if ($format === 'xls') {
            return response($this->versXls($declaration), 200, [
                'Content-Type' => 'application/vnd.ms-excel',
                'Content-Disposition' => "attachment; filename=\"{$base}.xls\"",
            ]);
        }

        // ZIP réel contenant les deux exports, généré sans l'extension `zip`
        // (absente de ce PHP) — voir App\Support\ZipSimple.
        $archive = (new ZipSimple())
            ->ajouter("{$base}.xml", $this->versXml($declaration))
            ->ajouter("{$base}.xls", $this->versXls($declaration))
            ->generer();

        return response($archive, 200, [
            'Content-Type' => 'application/zip',
            'Content-Disposition' => "attachment; filename=\"{$base}.zip\"",
        ]);
    }

    private function versXml(DeclarationTva $d): string
    {
        $xml = new \SimpleXMLElement('<?xml version="1.0" encoding="UTF-8"?><DeclarationTVA/>');
        $xml->addChild('Identifiant', htmlspecialchars((string) $d->client_if));
        $xml->addChild('Entreprise', htmlspecialchars((string) ($d->entreprise->denomination ?? '')));
        $xml->addChild('Annee', (string) $d->annee);
        $xml->addChild('Periode', (string) $d->periode_valeur);
        $xml->addChild('Regime', htmlspecialchars((string) $d->regime));
        $xml->addChild('TotalHT', (string) $d->total_ht);
        $xml->addChild('TotalTVA', (string) $d->total_tva);
        $xml->addChild('TotalTTC', (string) $d->total_ttc);

        $lignes = $xml->addChild('Lignes');
        foreach ($d->lignes as $l) {
            $n = $lignes->addChild('Ligne');
            $n->addChild('NumeroFacture', htmlspecialchars((string) $l->fact_num));
            $n->addChild('Designation', htmlspecialchars((string) $l->designation));
            $n->addChild('HT', (string) $l->ht);
            $n->addChild('TVA', (string) $l->tva);
            $n->addChild('TTC', (string) $l->ttc);
            $n->addChild('IF', htmlspecialchars((string) $l->identifiant_fiscal));
            $n->addChild('ICE', htmlspecialchars((string) $l->ice));
            $n->addChild('Taux', (string) $l->taux);
            $n->addChild('DateFacture', optional($l->date_fac)->toDateString() ?? '');
            $n->addChild('DatePaiement', optional($l->date_paie)->toDateString() ?? '');
        }

        return $xml->asXML();
    }

    private function versXls(DeclarationTva $d): string
    {
        $entetes = ['OR', 'FACT NUM', 'DESIGNATION', 'HT', 'TVA', 'TTC', 'IF', 'LIB FRSS', 'ICE', 'TAUX', 'ID PAIE', 'DATE PAIE', 'DATE FAC'];
        $html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8" /></head><body><table border="1"><thead><tr>';
        foreach ($entetes as $e) {
            $html .= '<th>'.htmlspecialchars($e).'</th>';
        }
        $html .= '</tr></thead><tbody>';

        foreach ($d->lignes as $l) {
            $cellules = [
                $l->ordre_ref, $l->fact_num, $l->designation, $l->ht, $l->tva, $l->ttc,
                $l->identifiant_fiscal, $l->libelle_fournisseur, $l->ice, $l->taux,
                $l->id_paie, optional($l->date_paie)->toDateString(), optional($l->date_fac)->toDateString(),
            ];
            $html .= '<tr>';
            foreach ($cellules as $c) {
                $html .= '<td>'.htmlspecialchars((string) $c).'</td>';
            }
            $html .= '</tr>';
        }

        return $html.'</tbody></table></body></html>';
    }
}
