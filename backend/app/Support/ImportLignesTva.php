<?php

namespace App\Support;

/**
 * « Importateur de TVA » : analyse (sans aucune écriture en base) des lignes lues dans un fichier Excel / CSV avant de les
 * ajouter à une Déclaration TVA.
 *
 * Les lignes importées sont EXACTEMENT celles de `declaration_tva_lignes` (les 13 colonnes du tableau de saisie et de
 * l'export Excel : OR, FACT NUM, DESIGNATION, HT, TVA, TTC, IF, LIB FRSS, ICE, TAUX, ID PAIE, DATE PAIE, DATE FAC). Les
 * règles reprennent celles de `DeclarationTvaController::regles()` (longueurs, taux 0–100, dates, montants numériques) et
 * le comportement du formulaire : TTC = HT + TVA quand il n'est pas fourni, taux 20 par défaut (valeur par défaut de la base).
 *
 * Le navigateur lit le fichier et envoie des valeurs brutes ; ce service est la SEULE source de vérité : il ne fait aucune
 * confiance au client (types, formats, tailles, doublons sont revérifiés ici, puis à nouveau au moment de l'enregistrement).
 */
final class ImportLignesTva
{
    public const MAX_LIGNES = 1000;

    /** Champs texte → longueur maximale (mêmes limites que la validation de la déclaration). */
    public const CHAMPS_TEXTE = [
        'ordre_ref' => 30,
        'fact_num' => 60,
        'designation' => 255,
        'identifiant_fiscal' => 30,
        'libelle_fournisseur' => 200,
        'ice' => 30,
        'id_paie' => 40,
    ];

    /** Seuil du contrôle « espèces » déjà appliqué par le formulaire (cumul TTC par IF, en Dh). */
    public const SEUIL_ESPECES = 5000;

    private const MONTANT_MAX = 999999999999.99; // decimal(14,2)

    /**
     * @param  array<int, mixed>  $lignes  chaque élément : champs de la ligne + `ligne` (numéro de ligne dans le fichier)
     * @param  iterable<int, array<string, mixed>>  $existantes  lignes déjà présentes dans la déclaration cible
     *                                                          (attributs de `declaration_tva_lignes`)
     * @return array{lignes: array<int, array<string, mixed>>, resume: array<string, int>, totaux: array<string, string>, alertes_especes: array<int, array<string, mixed>>}
     */
    public static function analyser(array $lignes, iterable $existantes = [], ?string $identifiantPaiementDefaut = null): array
    {
        $vues = [];
        $lignesExistantes = [];
        foreach ($existantes as $existante) {
            $existante = (array) $existante;
            $lignesExistantes[] = $existante;
            $vues[self::cleDoublon([
                'identifiant_fiscal' => $existante['identifiant_fiscal'] ?? '',
                'fact_num' => $existante['fact_num'] ?? '',
                'designation' => $existante['designation'] ?? '',
                'date_fac' => self::dateSql($existante['date_fac'] ?? null),
                'ht' => self::montant($existante['ht'] ?? 0),
                'tva' => self::montant($existante['tva'] ?? 0),
                'ttc' => self::montant($existante['ttc'] ?? 0),
            ])] ??= 'existante';
        }

        $rapport = [];
        $valides = [];
        $resume = ['total' => 0, 'valides' => 0, 'doublons' => 0, 'rejetees' => 0];

        foreach (array_values($lignes) as $position => $brut) {
            $resume['total']++;
            $numero = is_array($brut) && isset($brut['ligne']) && is_int($brut['ligne']) && $brut['ligne'] > 0 ? $brut['ligne'] : $position + 1;

            $analyse = self::analyserUneLigne(is_array($brut) ? $brut : []);

            if ($analyse['erreurs'] !== []) {
                $resume['rejetees']++;
                $rapport[] = ['ligne' => $numero, 'etat' => 'rejetee', 'erreurs' => $analyse['erreurs'], 'avertissements' => $analyse['avertissements'], 'valeurs' => $analyse['valeurs']];

                continue;
            }

            $cle = self::cleDoublon($analyse['valeurs']);
            if (isset($vues[$cle])) {
                $resume['doublons']++;
                $motif = $vues[$cle] === 'existante'
                    ? 'Cette ligne existe déjà dans la déclaration (même fournisseur, facture, date et montants).'
                    : "Identique à la ligne {$vues[$cle]} du fichier (même fournisseur, facture, date et montants).";
                $rapport[] = ['ligne' => $numero, 'etat' => 'doublon', 'motif' => $motif, 'avertissements' => $analyse['avertissements'], 'valeurs' => $analyse['valeurs']];

                continue;
            }

            $vues[$cle] = $numero;
            $resume['valides']++;
            $valides[] = $analyse['valeurs'] + ['ligne' => $numero];
            $rapport[] = ['ligne' => $numero, 'etat' => 'valide', 'avertissements' => $analyse['avertissements'], 'valeurs' => $analyse['valeurs']];
        }

        $totaux = ['ht' => 0.0, 'tva' => 0.0, 'ttc' => 0.0];
        foreach ($valides as $v) {
            $totaux['ht'] += (float) $v['ht'];
            $totaux['tva'] += (float) $v['tva'];
            $totaux['ttc'] += (float) $v['ttc'];
        }

        return [
            'lignes' => $rapport,
            'resume' => $resume,
            'totaux' => array_map(fn ($t) => self::montant($t), $totaux),
            'alertes_especes' => self::alertesEspeces($valides, $lignesExistantes, $identifiantPaiementDefaut),
        ];
    }

    /**
     * @param  array<string, mixed>  $brut
     * @return array{valeurs: array<string, mixed>, erreurs: array<int, string>, avertissements: array<int, string>}
     */
    private static function analyserUneLigne(array $brut): array
    {
        $erreurs = [];
        $avertissements = [];
        $valeurs = [];

        $tousVides = true;
        foreach (array_merge(array_keys(self::CHAMPS_TEXTE), ['ht', 'tva', 'ttc', 'taux', 'date_paie', 'date_fac']) as $champ) {
            if (self::contenu($brut[$champ] ?? null) !== '') {
                $tousVides = false;
            }
        }
        if ($tousVides) {
            return ['valeurs' => [], 'erreurs' => ['Ligne vide.'], 'avertissements' => []];
        }

        // Champs texte
        foreach (self::CHAMPS_TEXTE as $champ => $max) {
            $valeur = $brut[$champ] ?? null;
            if (is_array($valeur) || is_object($valeur)) {
                $erreurs[] = strtoupper(self::libelle($champ)).' : valeur invalide.';
                $valeurs[$champ] = null;

                continue;
            }
            $texte = self::contenu($valeur);
            if (preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $texte) === 1) {
                $erreurs[] = self::libelle($champ).' : caractères de contrôle interdits.';
            } elseif (mb_strlen($texte) > $max) {
                $erreurs[] = self::libelle($champ)." : {$max} caractères maximum (".mb_strlen($texte).' reçus).';
            }
            $valeurs[$champ] = $texte === '' ? null : $texte;
        }

        // Montants
        $montants = [];
        foreach (['ht' => true, 'tva' => true, 'ttc' => false] as $champ => $obligatoire) {
            $resultat = self::lireMontant($brut[$champ] ?? null);
            if ($resultat['vide']) {
                if ($obligatoire) {
                    $erreurs[] = self::libelle($champ).' : valeur obligatoire.';
                }
                $montants[$champ] = null;

                continue;
            }
            if ($resultat['erreur'] !== null) {
                $erreurs[] = self::libelle($champ).' : '.$resultat['erreur'];
                $montants[$champ] = null;

                continue;
            }
            if ($resultat['arrondi']) {
                $avertissements[] = self::libelle($champ).' arrondi à 2 décimales.';
            }
            $montants[$champ] = $resultat['valeur'];
        }

        if ($montants['ht'] !== null && $montants['tva'] !== null) {
            $attendu = round($montants['ht'] + $montants['tva'], 2);
            if ($montants['ttc'] === null) {
                $montants['ttc'] = $attendu; // même règle que le formulaire : TTC = HT + TVA
            } elseif (abs($montants['ttc'] - $attendu) > 0.01) {
                $avertissements[] = 'TTC ('.self::montant($montants['ttc']).') différent de HT + TVA ('.self::montant($attendu).') : la valeur du fichier est conservée.';
            }
        }
        foreach (['ht', 'tva', 'ttc'] as $champ) {
            $valeurs[$champ] = $montants[$champ] === null ? null : self::montant($montants[$champ]);
        }

        // Taux : 0 à 100 ; vide = valeur par défaut de la base (20)
        $taux = self::lireMontant($brut['taux'] ?? null);
        if ($taux['vide']) {
            $valeurs['taux'] = null;
        } elseif ($taux['erreur'] !== null) {
            $erreurs[] = 'TAUX : '.$taux['erreur'];
            $valeurs['taux'] = null;
        } elseif ($taux['valeur'] < 0 || $taux['valeur'] > 100) {
            $erreurs[] = 'TAUX : doit être compris entre 0 et 100.';
            $valeurs['taux'] = null;
        } else {
            $valeurs['taux'] = self::montant($taux['valeur']);
        }

        // Dates
        foreach (['date_paie', 'date_fac'] as $champ) {
            $texte = self::contenu($brut[$champ] ?? null);
            if ($texte === '') {
                $valeurs[$champ] = null;

                continue;
            }
            $date = self::parserDate($texte);
            if ($date === null) {
                $erreurs[] = self::libelle($champ)." : date invalide « {$texte} » (formats acceptés : AAAA-MM-JJ ou JJ/MM/AAAA).";
            }
            $valeurs[$champ] = $date;
        }

        return ['valeurs' => $valeurs, 'erreurs' => $erreurs, 'avertissements' => $avertissements];
    }

    /**
     * Montant en texte ou en nombre : « 1234.56 », « 1 234,56 », « 1.234,56 », « -100 », « 1 200 Dh ».
     *
     * @return array{vide: bool, valeur: float|null, erreur: string|null, arrondi: bool}
     */
    public static function lireMontant(mixed $valeur): array
    {
        if (is_array($valeur) || is_object($valeur) || is_bool($valeur)) {
            return ['vide' => false, 'valeur' => null, 'erreur' => 'valeur non numérique.', 'arrondi' => false];
        }

        $texte = self::contenu($valeur);
        if ($texte === '') {
            return ['vide' => true, 'valeur' => null, 'erreur' => null, 'arrondi' => false];
        }

        $propre = preg_replace('/\s*(dh|dhs|mad)\.?$/i', '', $texte);
        $propre = str_replace(["\u{00A0}", "\u{202F}", ' ', "'", '’'], '', (string) $propre);

        if ($propre === '' || preg_match('/^[+-]?\d[\d.,]*$/', $propre) !== 1) {
            return ['vide' => false, 'valeur' => null, 'erreur' => "valeur non numérique « {$texte} ».", 'arrondi' => false];
        }

        $signe = '';
        if ($propre[0] === '+' || $propre[0] === '-') {
            $signe = $propre[0] === '-' ? '-' : '';
            $propre = substr($propre, 1);
        }

        $nbVirgules = substr_count($propre, ',');
        $nbPoints = substr_count($propre, '.');
        if ($nbVirgules > 0 && $nbPoints > 0) {
            $separateur = strrpos($propre, ',') > strrpos($propre, '.') ? ',' : '.'; // le dernier est la virgule décimale
            $autre = $separateur === ',' ? '.' : ',';
            $propre = str_replace($autre, '', $propre);
            $propre = str_replace($separateur, '.', $propre);
        } elseif ($nbVirgules > 0) {
            $propre = $nbVirgules > 1 ? str_replace(',', '', $propre) : str_replace(',', '.', $propre);
        } elseif ($nbPoints > 1) {
            $propre = str_replace('.', '', $propre);
        }

        if (preg_match('/^\d+(\.\d+)?$/', $propre) !== 1) {
            return ['vide' => false, 'valeur' => null, 'erreur' => "valeur non numérique « {$texte} ».", 'arrondi' => false];
        }

        $nombre = (float) ($signe.$propre);
        $decimales = str_contains($propre, '.') ? strlen(substr($propre, (int) strpos($propre, '.') + 1)) : 0;
        $arrondi = round($nombre, 2);
        if (abs($arrondi) > self::MONTANT_MAX) {
            return ['vide' => false, 'valeur' => null, 'erreur' => "montant trop élevé « {$texte} ».", 'arrondi' => false];
        }

        return ['vide' => false, 'valeur' => $arrondi, 'erreur' => null, 'arrondi' => $decimales > 2 && abs($arrondi - $nombre) > 1e-9];
    }

    /** AAAA-MM-JJ, AAAA-MM-JJ hh:mm:ss, JJ/MM/AAAA, JJ-MM-AAAA, JJ.MM.AAAA ; null si la date n'existe pas. */
    public static function parserDate(string $texte): ?string
    {
        $texte = trim($texte);

        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/', $texte, $m) === 1) {
            [$annee, $mois, $jour] = [(int) $m[1], (int) $m[2], (int) $m[3]];
        } elseif (preg_match('/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/', $texte, $m) === 1) {
            [$jour, $mois, $annee] = [(int) $m[1], (int) $m[2], (int) $m[3]];
        } else {
            return null;
        }

        if ($annee < 1990 || $annee > 2100 || ! checkdate($mois, $jour, $annee)) {
            return null;
        }

        return sprintf('%04d-%02d-%02d', $annee, $mois, $jour);
    }

    /**
     * Même facture = même fournisseur (IF), même numéro de facture, même date et mêmes montants. Sans IF ni numéro de
     * facture, la désignation entre dans la clé (sinon deux lignes différentes de mêmes montants seraient confondues).
     *
     * @param  array<string, mixed>  $ligne
     */
    public static function cleDoublon(array $ligne): string
    {
        $norm = fn ($v) => mb_strtoupper(preg_replace('/\s+/', '', (string) ($v ?? '')) ?? '');
        $identifiant = $norm($ligne['identifiant_fiscal'] ?? '');
        $facture = $norm($ligne['fact_num'] ?? '');

        return implode('|', [
            $identifiant,
            $facture,
            $identifiant === '' && $facture === '' ? $norm($ligne['designation'] ?? '') : '',
            (string) ($ligne['date_fac'] ?? ''),
            self::montant($ligne['ht'] ?? 0),
            self::montant($ligne['tva'] ?? 0),
            self::montant($ligne['ttc'] ?? 0),
        ]);
    }

    /**
     * Contrôle « espèces » du formulaire : pour un même IF, cumul du TTC des factures réglées en espèces
     * (`id_paie` de la ligne ou, à défaut, identifiant de paiement de l'en-tête contenant « ESPECE »). Informatif.
     *
     * @param  array<int, array<string, mixed>>  $nouvelles
     * @param  array<int, array<string, mixed>>  $existantes
     * @return array<int, array<string, mixed>>
     */
    public static function alertesEspeces(array $nouvelles, array $existantes, ?string $identifiantPaiementDefaut): array
    {
        $groupes = [];

        $ajouter = function (array $l, bool $nouvelle) use (&$groupes, $identifiantPaiementDefaut) {
            $identifiantPaiement = strtoupper((string) (($l['id_paie'] ?? '') !== '' ? $l['id_paie'] : $identifiantPaiementDefaut));
            if (! str_contains($identifiantPaiement, 'ESPECE')) {
                return;
            }
            $identifiantFiscal = strtoupper(trim((string) ($l['identifiant_fiscal'] ?? '')));
            if ($identifiantFiscal === '') {
                return; // sans IF, jamais regroupée avec une autre ligne
            }
            $groupes[$identifiantFiscal] ??= ['identifiant_fiscal' => $identifiantFiscal, 'total' => 0.0, 'nb_lignes' => 0, 'lignes' => []];
            $groupes[$identifiantFiscal]['total'] += (float) ($l['ttc'] ?? 0);
            $groupes[$identifiantFiscal]['nb_lignes']++;
            if ($nouvelle && isset($l['ligne'])) {
                $groupes[$identifiantFiscal]['lignes'][] = $l['ligne'];
            }
        };

        foreach ($existantes as $l) {
            $ajouter($l, false);
        }
        foreach ($nouvelles as $l) {
            $ajouter($l, true);
        }

        return array_values(array_map(
            fn ($g) => ['total' => self::montant($g['total'])] + $g,
            array_filter($groupes, fn ($g) => $g['total'] > self::SEUIL_ESPECES && $g['lignes'] !== [])
        ));
    }

    public static function montant(mixed $valeur): string
    {
        return number_format(round((float) $valeur, 2), 2, '.', '');
    }

    private static function dateSql(mixed $valeur): string
    {
        if ($valeur instanceof \DateTimeInterface) {
            return $valeur->format('Y-m-d');
        }

        return $valeur ? substr((string) $valeur, 0, 10) : '';
    }

    private static function contenu(mixed $valeur): string
    {
        if (is_array($valeur) || is_object($valeur) || $valeur === null) {
            return '';
        }

        return trim((string) $valeur);
    }

    private static function libelle(string $champ): string
    {
        return [
            'ordre_ref' => 'OR', 'fact_num' => 'FACT NUM', 'designation' => 'DESIGNATION', 'ht' => 'HT', 'tva' => 'TVA', 'ttc' => 'TTC',
            'identifiant_fiscal' => 'IF', 'libelle_fournisseur' => 'LIB FRSS', 'ice' => 'ICE', 'taux' => 'TAUX',
            'id_paie' => 'ID PAIE', 'date_paie' => 'DATE PAIE', 'date_fac' => 'DATE FAC',
        ][$champ] ?? $champ;
    }
}
