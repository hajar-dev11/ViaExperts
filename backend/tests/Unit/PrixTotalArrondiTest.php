<?php

namespace Tests\Unit;

use App\Modules\Domiciliation\Services\PrixDomiciliation;
use App\Support\ArrondiPrix;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Règle d'arrondi du PRIX TOTAL (domiciliation) : décimale < 0,50 → supprimée ; ≥ 0,50 → +1 sur la partie entière.
 * Mêmes valeurs que le test frontend (src/__tests__/prix-total-arrondi.test.js) : une seule règle des deux côtés.
 * Fonctions pures : aucune base de données n'est utilisée.
 */
class PrixTotalArrondiTest extends TestCase
{
    public static function exemples(): array
    {
        return [
            '1 250,30 → décimale < 0,50' => ['1250.30', 1250],
            '1 250,49 → juste sous le demi' => ['1250.49', 1250],
            '1 250,50 → exactement 0,50' => ['1250.50', 1251],
            '1 250,75 → décimale > 0,50' => ['1250.75', 1251],
            '1 250,00 → déjà entier' => ['1250.00', 1250],
        ];
    }

    #[DataProvider('exemples')]
    public function test_arrondi_du_prix_total(string $saisie, int $attendu): void
    {
        $this->assertSame($attendu, ArrondiPrix::entier($saisie));
        $this->assertSame(number_format($attendu, 2, '.', ''), ArrondiPrix::decimal($saisie));
    }

    #[DataProvider('exemples')]
    public function test_total_calcule_pour_un_mois_paye(string $prixParMois, int $attendu): void
    {
        $this->assertSame(number_format($attendu, 2, '.', ''), PrixDomiciliation::total($prixParMois, 1));
    }

    public function test_seul_le_total_est_arrondi_pas_le_prix_par_mois(): void
    {
        $this->assertSame('625.00', PrixDomiciliation::total('104.17', 6)); // 625,02 → 625
        $this->assertSame('1250.00', PrixDomiciliation::total('104.17', 12)); // 1 250,04
        $this->assertSame('523.00', PrixDomiciliation::total('104.50', 5)); // 522,50 → 523
        $this->assertSame('104.17', PrixDomiciliation::exact('104.17')); // le prix par mois garde ses centimes
    }
}
