<?php

namespace App\Http\Controllers\Api\V1;

use App\Contracts\ServicesEnCours\AssureServicesEnCours;
use App\Http\Controllers\Controller;
use App\Models\DeclarationTva;
use App\Models\Entreprise;
use App\Support\ImageDeclarationTva;
use App\Support\ImportLignesTva;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * « Importateur de TVA » : ajoute à une Déclaration TVA les lignes lues dans un fichier Excel / CSV.
 *
 * Deux temps, qui partagent exactement la même analyse (`ImportLignesTva`) :
 *   1. `apercu`    — analyse seulement : AUCUNE écriture en base ;
 *   2. `importer`  — après confirmation de l'utilisateur : réanalyse (le serveur ne fait pas confiance à l'aperçu), puis
 *                    enregistre dans UNE transaction (tout ou rien) avec verrou sur la déclaration.
 *
 * Droits (mêmes règles que le module Déclaration TVA, plus `declaration.importeur`, exigé par la route) :
 *   - cible « existante » : `declaration.modifier` — seulement une déclaration ACTIVE et « Non Déclarée » (brouillon) :
 *     une déclaration déjà déclarée ne reçoit jamais de lignes en silence ;
 *   - cible « nouvelle »  : `declaration.ajouter` + `declaration.sauvegarder_non_declare` — créée « Non Déclarée ».
 * Les lignes ne sont JAMAIS écrasées : elles sont ajoutées, et celles déjà présentes (doublons) sont ignorées.
 */
class ImportateurTvaController extends Controller
{
    private const MODULE = 'declaration';

    public function __construct(private AssureServicesEnCours $servicesEnCours)
    {
    }

    /**
     * « Importateur de Déclaration » : réception de la PHOTO ou du PDF d'une déclaration TVA.
     *
     * Le serveur contrôle le contenu RÉEL du fichier (format, taille, dimensions pour une image ; structure et éléments actifs
     * pour un PDF) et en renvoie les caractéristiques. Il n'extrait rien : l'analyse du texte (OCR) se fait dans le
     * navigateur de l'utilisateur, aucun document n'est envoyé à un tiers, le fichier n'est pas conservé (il disparaît avec
     * la requête) et RIEN n'est créé ici : la déclaration n'est enregistrée qu'après vérification et validation par
     * l'utilisateur, par la route habituelle de la Déclaration TVA (`lignes_creees = 0`).
     */
    public function image(Request $request): JsonResponse
    {
        $request->validate(['fichier' => ImageDeclarationTva::regles()], ImageDeclarationTva::messages());

        $fichier = $request->file('fichier');
        $estPdf = $fichier->getMimeType() === 'application/pdf';
        $dimensions = $estPdf ? false : @getimagesize($fichier->getRealPath());

        // Nom d'origine, sans chemin ni caractères de contrôle (il est simplement renvoyé pour l'affichage).
        $nom = preg_replace('/[\x00-\x1F\x7F]+/u', '', basename((string) $fichier->getClientOriginalName())) ?? '';

        return response()->json([
            'recue' => true,
            'nom' => mb_substr($nom, 0, 120),
            'categorie' => $estPdf ? 'pdf' : 'image',
            'type' => $estPdf ? 'application/pdf' : ($dimensions['mime'] ?? $fichier->getMimeType()),
            'taille' => $fichier->getSize(),
            'largeur' => $dimensions[0] ?? null,
            'hauteur' => $dimensions[1] ?? null,
            'pages' => $estPdf ? (ImageDeclarationTva::pagesPdf((string) file_get_contents($fichier->getRealPath())) ?: null) : null,
            'analyse' => ['lieu' => 'navigateur', 'message' => ImageDeclarationTva::MESSAGE_ANALYSE],
            'lignes_creees' => 0,
        ]);
    }
    public function apercu(Request $request): JsonResponse
    {
        $data = $this->valider($request);
        [$cible, $existantes, $identifiantPaiement] = $this->resoudreCible($request, $data['cible'], false);

        $rapport = ImportLignesTva::analyser($data['lignes'], $existantes, $identifiantPaiement);

        return response()->json(['cible' => $cible] + $rapport);
    }

    public function importer(Request $request): JsonResponse
    {
        $data = $this->valider($request);
        $ignorerRejetees = $request->boolean('ignorer_rejetees');

        $resultat = DB::transaction(function () use ($request, $data, $ignorerRejetees) {
            [$cible, $existantes, $identifiantPaiement, $declaration] = $this->resoudreCible($request, $data['cible'], true);

            $rapport = ImportLignesTva::analyser($data['lignes'], $existantes, $identifiantPaiement);
            $resume = $rapport['resume'];

            if ($resume['valides'] === 0) {
                $this->refuser('Aucune ligne à importer : toutes les lignes sont rejetées ou déjà présentes.', $rapport + ['cible' => $cible]);
            }
            if ($resume['rejetees'] > 0 && ! $ignorerRejetees) {
                $this->refuser("{$resume['rejetees']} ligne(s) rejetée(s) : corrigez le fichier, ou confirmez l'import des seules lignes valides.", $rapport + ['cible' => $cible]);
            }

            if ($declaration === null) {
                $declaration = $this->creerDeclaration($request, $data['cible']);
                $cible['declaration_id'] = $declaration->id;
            }

            $ordre = (int) $declaration->lignes()->max('ordre');
            $ordre = $declaration->lignes()->exists() ? $ordre + 1 : 0;

            foreach ($rapport['lignes'] as $ligne) {
                if ($ligne['etat'] !== 'valide') {
                    continue;
                }
                $v = $ligne['valeurs'];
                $attributs = [
                    'ordre_ref' => $v['ordre_ref'], 'fact_num' => $v['fact_num'], 'designation' => $v['designation'],
                    'ht' => $v['ht'], 'tva' => $v['tva'], 'ttc' => $v['ttc'],
                    'identifiant_fiscal' => $v['identifiant_fiscal'], 'libelle_fournisseur' => $v['libelle_fournisseur'],
                    'ice' => $v['ice'], 'id_paie' => $v['id_paie'], 'date_paie' => $v['date_paie'], 'date_fac' => $v['date_fac'],
                    'ordre' => $ordre++,
                ];
                // Taux vide : valeur par défaut de la base (20), comme dans le formulaire.
                if ($v['taux'] !== null) {
                    $attributs['taux'] = $v['taux'];
                }
                $declaration->lignes()->create($attributs);
            }

            $declaration->load('lignes');
            $declaration->recalculerTotaux();

            if ($cible['type'] === 'nouvelle') {
                // Comme l'enregistrement d'une nouvelle déclaration : « Déclaration TVA » apparaît dans Services en cours.
                $clientId = Entreprise::where('party_id', $declaration->entreprise_id)->value('client_id');
                $this->servicesEnCours->assurerPourClient('Déclaration TVA', $clientId, $request->user()->id, ['type' => 'declaration_tva', 'id' => $declaration->id]);
            }

            $declaration->refresh();

            return $rapport + [
                'cible' => $cible,
                'importees' => $resume['valides'],
                'declaration' => [
                    'id' => $declaration->id,
                    'nombre_lignes' => $declaration->lignes()->count(),
                    'total_ht' => $declaration->total_ht,
                    'total_tva' => $declaration->total_tva,
                    'total_ttc' => $declaration->total_ttc,
                ],
            ];
        });

        return response()->json($resultat, 201);
    }

    /**
     * @return array<string, mixed>
     */
    private function valider(Request $request): array
    {
        return $request->validate([
            'cible' => ['required', 'array'],
            'cible.type' => ['required', 'in:existante,nouvelle'],
            'cible.declaration_id' => ['required_if:cible.type,existante', 'nullable', 'integer'],
            'cible.entreprise_id' => ['required_if:cible.type,nouvelle', 'nullable', 'integer', 'exists:entreprises,party_id'],
            'cible.client_if' => ['required_if:cible.type,nouvelle', 'nullable', 'string', 'max:30'],
            'cible.identifiant_paiement' => ['nullable', 'string', 'max:40'],
            'cible.periode_type' => ['required_if:cible.type,nouvelle', 'nullable', 'in:trimestre,mois'],
            'cible.periode_valeur' => ['required_if:cible.type,nouvelle', 'nullable', 'integer', 'min:1', 'max:'.($request->input('cible.periode_type') === 'trimestre' ? 4 : 12)],
            'cible.annee' => ['required_if:cible.type,nouvelle', 'nullable', 'integer', 'min:2000', 'max:2100'],
            'cible.regime' => ['nullable', 'string', 'max:40'],
            'lignes' => ['required', 'array', 'min:1', 'max:'.ImportLignesTva::MAX_LIGNES],
            'lignes.*' => ['array'],
        ], [
            'lignes.required' => 'Le fichier ne contient aucune ligne à importer.',
            'lignes.min' => 'Le fichier ne contient aucune ligne à importer.',
            'lignes.max' => 'Le fichier contient trop de lignes : '.ImportLignesTva::MAX_LIGNES.' au maximum par import.',
        ]);
    }

    /**
     * Vérifie les droits et l'état de la cible. Renvoie [résumé de la cible, lignes existantes, identifiant de paiement
     * par défaut, déclaration (ou null pour une nouvelle)].
     *
     * @param  array<string, mixed>  $cible
     * @return array{0: array<string, mixed>, 1: array<int, array<string, mixed>>, 2: string|null, 3: DeclarationTva|null}
     */
    private function resoudreCible(Request $request, array $cible, bool $verrouiller): array
    {
        $utilisateur = $request->user();

        if ($cible['type'] === 'existante') {
            abort_unless($utilisateur->hasPermission(self::MODULE, 'modifier') && $utilisateur->hasPermission(self::MODULE, 'liste'), 403, "Permission refusée : modifier une déclaration TVA.");

            $requete = DeclarationTva::with('entreprise')->type('tva');
            $declaration = ($verrouiller ? $requete->lockForUpdate() : $requete)->find($cible['declaration_id']);
            abort_if($declaration === null, 404, 'Déclaration TVA introuvable.');

            if ($declaration->status !== 'actif') {
                $this->refuser('Cette déclaration est archivée ou dans la corbeille : restaurez-la avant d\'importer.');
            }
            if ($declaration->situation !== 'non_declaree') {
                $this->refuser('Cette déclaration est déjà « Déclarée » : repassez-la en « Non Déclaré » avant d\'importer des lignes.');
            }

            // Dates en AAAA-MM-JJ (attributesToArray les convertirait en UTC et pourrait les décaler d'un jour).
            $existantes = $declaration->lignes()->get()->map(fn ($l) => [
                'ordre_ref' => $l->ordre_ref, 'fact_num' => $l->fact_num, 'designation' => $l->designation,
                'ht' => $l->ht, 'tva' => $l->tva, 'ttc' => $l->ttc,
                'identifiant_fiscal' => $l->identifiant_fiscal, 'id_paie' => $l->id_paie,
                'date_fac' => optional($l->date_fac)->toDateString(),
            ])->all();

            return [[
                'type' => 'existante',
                'declaration_id' => $declaration->id,
                'entreprise' => $declaration->entreprise->denomination ?? null,
                'periode' => "{$declaration->periode_type} : {$declaration->periode_valeur}",
                'annee' => $declaration->annee,
                'situation' => $declaration->situation,
                'lignes_existantes' => count($existantes),
            ], $existantes, $declaration->identifiant_paiement, $declaration];
        }

        abort_unless(
            $utilisateur->hasPermission(self::MODULE, 'ajouter') && $utilisateur->hasPermission(self::MODULE, 'sauvegarder_non_declare'),
            403,
            'Permission refusée : créer une déclaration TVA.'
        );

        $existante = DeclarationTva::type('tva')
            ->where('entreprise_id', $cible['entreprise_id'])
            ->where('periode_type', $cible['periode_type'])
            ->where('periode_valeur', $cible['periode_valeur'])
            ->where('annee', $cible['annee'])
            ->whereIn('status', ['actif', 'archive'])
            ->first();
        if ($existante !== null) {
            $this->refuser("Une déclaration existe déjà pour cette entreprise et cette période (n° {$existante->id}) : choisissez-la comme cible plutôt que d'en créer une seconde.", ['declaration_existante_id' => $existante->id]);
        }

        return [[
            'type' => 'nouvelle',
            'declaration_id' => null,
            'entreprise' => Entreprise::where('party_id', $cible['entreprise_id'])->value('denomination'),
            'periode' => "{$cible['periode_type']} : {$cible['periode_valeur']}",
            'annee' => (int) $cible['annee'],
            'situation' => 'non_declaree',
            'lignes_existantes' => 0,
        ], [], $cible['identifiant_paiement'] ?? null, null];
    }

    /** @param  array<string, mixed>  $cible */
    private function creerDeclaration(Request $request, array $cible): DeclarationTva
    {
        return DeclarationTva::create([
            'type' => 'tva',
            'entreprise_id' => $cible['entreprise_id'],
            'client_if' => $cible['client_if'],
            'identifiant_paiement' => $cible['identifiant_paiement'] ?? null,
            'periode_type' => $cible['periode_type'],
            'periode_valeur' => $cible['periode_valeur'],
            'annee' => $cible['annee'],
            'regime' => $cible['regime'] ?? null,
            'situation' => 'non_declaree',
            'created_by' => $request->user()->id,
        ]);
    }

    /** @param  array<string, mixed>  $details */
    private function refuser(string $message, array $details = []): never
    {
        throw new HttpResponseException(response()->json(['message' => $message] + $details, 422));
    }
}
