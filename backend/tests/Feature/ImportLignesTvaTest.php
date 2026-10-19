<?php

namespace Tests\Feature;

use App\Support\ImportLignesTva;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Règles de lecture des montants et dates, détection des doublons et contrôle « espèces » de l'importateur de TVA
 * (logique pure, sans base de données).
 */
class ImportLignesTvaTest extends TestCase
{
    /** @return array<string, array{0: mixed, 1: float|null}> */
    public static function montants(): array
    {
        return [
            'entier' => ['1000', 1000.0],
            'point décimal' => ['1234.56', 1234.56],
            'virgule décimale' => ['1234,56', 1234.56],
            'espace insécable en milliers' => ["1\u{00A0}234,56", 1234.56],
            'espaces en milliers' => ['1 234 567,89', 1234567.89],
            'format 1.234,56' => ['1.234,56', 1234.56],
            'format 1,234.56' => ['1,234.56', 1234.56],
            'plusieurs points = milliers' => ['1.234.567', 1234567.0],
            'négatif' => ['-250,5', -250.5],
            'avec signe +' => ['+75', 75.0],
            'suffixe Dh' => ['1 200 Dh', 1200.0],
            'suffixe MAD' => ['350,00 MAD', 350.0],
            'nombre natif' => [1500.5, 1500.5],
            'entier natif' => [42, 42.0],
            'arrondi à 2 décimales' => ['10.126', 10.13],
            'zéro' => ['0', 0.0],
            'texte' => ['abc', null],
            'notation scientifique' => ['1E+3', null],
            'deux séparateurs décimaux' => ['1,2,3x', null],
            'lettres mélangées' => ['12a', null],
            'trop grand' => ['1000000000000', null],
            'seulement un signe' => ['-', null],
        ];
    }

    #[DataProvider('montants')]
    public function test_lecture_des_montants(mixed $entree, ?float $attendu): void
    {
        $resultat = ImportLignesTva::lireMontant($entree);

        $this->assertFalse($resultat['vide']);
        if ($attendu === null) {
            $this->assertNotNull($resultat['erreur']);
            $this->assertNull($resultat['valeur']);
        } else {
            $this->assertNull($resultat['erreur'], 'erreur inattendue : '.json_encode($resultat['erreur']));
            $this->assertEqualsWithDelta($attendu, $resultat['valeur'], 0.0001);
        }
    }

    public function test_montant_vide_et_valeurs_non_scalaires(): void
    {
        foreach ([null, '', '   '] as $vide) {
            $this->assertTrue(ImportLignesTva::lireMontant($vide)['vide']);
        }
        foreach ([[1], true, new \stdClass()] as $invalide) {
            $r = ImportLignesTva::lireMontant($invalide);
            $this->assertFalse($r['vide']);
            $this->assertNotNull($r['erreur']);
        }
    }

    public function test_un_montant_arrondi_est_signale(): void
    {
        $this->assertTrue(ImportLignesTva::lireMontant('10.126')['arrondi']);
        $this->assertFalse(ImportLignesTva::lireMontant('10.12')['arrondi']);
        $this->assertFalse(ImportLignesTva::lireMontant('10.120')['arrondi']);
    }

    /** @return array<string, array{0: string, 1: string|null}> */
    public static function dates(): array
    {
        return [
            'ISO' => ['2026-03-15', '2026-03-15'],
            'ISO avec heure' => ['2026-03-15 10:30:00', '2026-03-15'],
            'ISO T et fuseau' => ['2026-03-15T10:30:00Z', '2026-03-15'],
            'jj/mm/aaaa' => ['15/03/2026', '2026-03-15'],
            'j/m/aaaa' => ['5/3/2026', '2026-03-05'],
            'jj-mm-aaaa' => ['15-03-2026', '2026-03-15'],
            'jj.mm.aaaa' => ['15.03.2026', '2026-03-15'],
            'année bissextile' => ['29/02/2028', '2028-02-29'],
            '29 février non bissextile' => ['29/02/2026', null],
            '31 avril' => ['31/04/2026', null],
            'mois 13' => ['01/13/2026', null],
            'année sur 2 chiffres' => ['15/03/26', null],
            'année trop ancienne' => ['15/03/1980', null],
            'texte' => ['demain', null],
            'numéro de série Excel brut' => ['46095', null],
        ];
    }

    #[DataProvider('dates')]
    public function test_lecture_des_dates(string $entree, ?string $attendu): void
    {
        $this->assertSame($attendu, ImportLignesTva::parserDate($entree));
    }

    public function test_cle_de_doublon_insensible_a_la_casse_aux_espaces_et_aux_formats(): void
    {
        $a = ['identifiant_fiscal' => 'if 100', 'fact_num' => 'F-1', 'date_fac' => '2026-03-15', 'ht' => '1000', 'tva' => '200', 'ttc' => '1200'];
        $b = ['identifiant_fiscal' => 'IF100', 'fact_num' => ' f-1 ', 'date_fac' => '2026-03-15', 'ht' => '1000.00', 'tva' => 200, 'ttc' => 1200.0];
        $autreMontant = $b + [];
        $autreMontant['ht'] = '1000.01';

        $this->assertSame(ImportLignesTva::cleDoublon($a), ImportLignesTva::cleDoublon($b));
        $this->assertNotSame(ImportLignesTva::cleDoublon($a), ImportLignesTva::cleDoublon($autreMontant));
    }

    public function test_sans_if_ni_facture_la_designation_distingue_les_lignes(): void
    {
        $base = ['ht' => '100', 'tva' => '20', 'ttc' => '120'];

        $this->assertNotSame(
            ImportLignesTva::cleDoublon($base + ['designation' => 'Fournitures']),
            ImportLignesTva::cleDoublon($base + ['designation' => 'Transport'])
        );
        // Avec une facture, la désignation n'intervient pas.
        $this->assertSame(
            ImportLignesTva::cleDoublon($base + ['fact_num' => 'F1', 'designation' => 'A']),
            ImportLignesTva::cleDoublon($base + ['fact_num' => 'F1', 'designation' => 'B'])
        );
    }

    public function test_analyse_reprend_les_regles_de_la_declaration_et_numerote_les_lignes(): void
    {
        $rapport = ImportLignesTva::analyser([
            ['ligne' => 10, 'ht' => '100', 'tva' => '20'],
            ['ligne' => 11, 'ht' => '100', 'tva' => '20'],        // doublon de la ligne 10
            ['ligne' => 12, 'ht' => '', 'tva' => '5'],
        ]);

        $this->assertSame(['total' => 3, 'valides' => 1, 'doublons' => 1, 'rejetees' => 1], $rapport['resume']);
        $this->assertSame([10, 11, 12], array_column($rapport['lignes'], 'ligne'));
        $this->assertSame('120.00', $rapport['lignes'][0]['valeurs']['ttc']);
        $this->assertSame('Identique à la ligne 10 du fichier (même fournisseur, facture, date et montants).', $rapport['lignes'][1]['motif']);
        $this->assertSame(['ht' => '100.00', 'tva' => '20.00', 'ttc' => '120.00'], $rapport['totaux']);
    }

    public function test_les_lignes_existantes_comptent_pour_les_doublons(): void
    {
        $existantes = [['identifiant_fiscal' => 'IF1', 'fact_num' => 'F1', 'designation' => 'X', 'date_fac' => '2026-01-10', 'ht' => '100.00', 'tva' => '20.00', 'ttc' => '120.00']];

        $rapport = ImportLignesTva::analyser([
            ['ligne' => 2, 'identifiant_fiscal' => 'IF1', 'fact_num' => 'F1', 'date_fac' => '10/01/2026', 'ht' => '100', 'tva' => '20', 'ttc' => '120'],
            ['ligne' => 3, 'identifiant_fiscal' => 'IF1', 'fact_num' => 'F1', 'date_fac' => '10/01/2026', 'ht' => '150', 'tva' => '30'], // autres montants : ligne distincte
        ], $existantes);

        $this->assertSame('doublon', $rapport['lignes'][0]['etat']);
        $this->assertSame('valide', $rapport['lignes'][1]['etat']);
    }

    public function test_alertes_especes_cumul_par_if_au_dela_du_seuil_seulement(): void
    {
        $alertes = ImportLignesTva::alertesEspeces(
            [
                ['ligne' => 2, 'identifiant_fiscal' => 'A', 'ttc' => '3000.00', 'id_paie' => ''],
                ['ligne' => 3, 'identifiant_fiscal' => 'A', 'ttc' => '2500.00', 'id_paie' => ''],
                ['ligne' => 4, 'identifiant_fiscal' => 'B', 'ttc' => '9000.00', 'id_paie' => 'CHEQUE'],     // pas espèces
                ['ligne' => 5, 'identifiant_fiscal' => 'C', 'ttc' => '4000.00', 'id_paie' => 'ESPECE'],     // sous le seuil
                ['ligne' => 6, 'identifiant_fiscal' => '', 'ttc' => '8000.00', 'id_paie' => 'ESPECE'],      // sans IF : jamais regroupée
            ],
            [],
            null
        );
        // Sans identifiant de paiement d'en-tête, seules les lignes dont ID PAIE contient ESPECE comptent : A n'en a aucune.
        $this->assertSame([], $alertes);

        $alertes = ImportLignesTva::alertesEspeces(
            [
                ['ligne' => 2, 'identifiant_fiscal' => 'A', 'ttc' => '3000.00', 'id_paie' => ''],
                ['ligne' => 3, 'identifiant_fiscal' => 'A', 'ttc' => '2500.00', 'id_paie' => ''],
                ['ligne' => 4, 'identifiant_fiscal' => 'B', 'ttc' => '9000.00', 'id_paie' => 'CHEQUE'],
            ],
            [['identifiant_fiscal' => 'A', 'ttc' => '100.00', 'id_paie' => '']],
            '1-ESPECES'
        );
        $this->assertCount(1, $alertes);
        $this->assertSame('A', $alertes[0]['identifiant_fiscal']);
        $this->assertSame('5600.00', $alertes[0]['total']); // 3000 + 2500 + 100 (ligne déjà dans la déclaration)
        $this->assertSame(3, $alertes[0]['nb_lignes']);
        $this->assertSame([2, 3], $alertes[0]['lignes']);
    }
}
