<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Party;
use App\Models\Paiement;
use App\Models\Service;
use App\Models\User;
use App\Modules\Facturation\Models\DocumentCommercial;
use App\Support\ArrondiPrix;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Règle d'arrondi du PRIX TOTAL (0,50 → entier supérieur) et quantités entières.
 * Les prix unitaires gardent leurs centimes ; seuls les totaux (total HT d'un document, total d'un paiement) sont arrondis.
 * Les montants déjà enregistrés ne sont jamais réécrits.
 */
class ArrondiEtQuantitesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
    }

    private function admin(): User
    {
        return User::factory()->create(['is_admin' => true]);
    }

    private function client(): Client
    {
        $party = Party::create(['type' => 'client', 'status' => 'actif']);

        return Client::create(['party_id' => $party->id, 'type' => 'client', 'genre' => 'M', 'nom' => 'CLIENT TEST']);
    }

    private function document(User $u, Client $c, array $lignes, string $numero = 'AR-1')
    {
        return $this->actingAs($u)->postJson('/api/v1/facturation/facture', [
            'emetteur' => 'bureau_comptabilite', 'party_id' => $c->party_id, 'numero' => $numero, 'date_document' => '2026-10-13',
            'lignes' => $lignes,
        ]);
    }

    // ---- Règle d'arrondi -----------------------------------------------------------------------------------------

    public static function exemples(): array
    {
        return [
            'moins de 0,50 : inférieur' => ['104.17', 104],
            '0,80 : supérieur' => ['100.80', 101],
            'exactement 0,50 : supérieur' => ['100.50', 101],
            '0,49 : inférieur' => ['100.49', 100],
            'entier inchangé' => ['104.00', 104],
            'zéro' => ['0', 0],
            'nombre natif' => [104.17, 104],
            'juste sous le demi (0,495 → 0,50 → supérieur)' => ['100.495', 101],
            'grand montant' => ['12345.49', 12345],
            'vide' => ['', 0],
            'null' => [null, 0],
        ];
    }

    /** @dataProvider exemples */
    public function test_la_regle_d_arrondi(mixed $entree, int $attendu): void
    {
        $this->assertSame($attendu, ArrondiPrix::entier($entree));
        $this->assertSame(number_format($attendu, 2, '.', ''), ArrondiPrix::decimal($entree));
    }

    public function test_les_totaux_d_un_document_arrondissent_le_total_ht_et_calculent_la_tva_dessus(): void
    {
        // 6 mois × 104,17 = 625,02 → total HT 625 ; TVA 20 % = 125 ; TTC = 750.
        $t = ArrondiPrix::totauxDocument([['brut' => 6 * 104.17, 'remise' => 0, 'tva_pourcent' => 20]]);
        $this->assertSame(['total_ht' => 625.0, 'total_remise' => 0.0, 'total_net_ht' => 625.0, 'total_tva' => 125.0, 'total_ttc' => 750.0], $t);

        // 1 250,49 → 1 250 ; 1 250,50 → 1 251 (la TVA se calcule sur le total arrondi).
        $this->assertSame(1250.0, ArrondiPrix::totauxDocument([['brut' => 1250.49, 'remise' => 0, 'tva_pourcent' => 0]])['total_net_ht']);
        $this->assertSame(1251.0, ArrondiPrix::totauxDocument([['brut' => 1250.50, 'remise' => 0, 'tva_pourcent' => 0]])['total_net_ht']);

        // Remise : le total HT arrondi porte sur le net ; HT − remise = net.
        $r = ArrondiPrix::totauxDocument([['brut' => 1000.30, 'remise' => 100.10, 'tva_pourcent' => 20]]);
        $this->assertSame(900.0, $r['total_net_ht']); // 900,20 → 900
        $this->assertSame(100.1, $r['total_remise']);
        $this->assertSame(1000.1, $r['total_ht']);
        $this->assertSame(180.0, $r['total_tva']);
        $this->assertSame(1080.0, $r['total_ttc']);

        // Aucune ligne : tout à zéro.
        $this->assertSame(0.0, ArrondiPrix::totauxDocument([])['total_ttc']);
    }

    // ---- Documents -----------------------------------------------------------------------------------------------

    public function test_les_prix_unitaires_d_un_document_gardent_leurs_centimes_et_le_total_ht_est_arrondi(): void
    {
        $u = $this->admin();
        $c = $this->client();

        $id = $this->document($u, $c, [
            ['designation' => 'A', 'quantite' => 3, 'prix_unitaire' => 104.17, 'tva_pourcent' => 20],
            ['designation' => 'B', 'quantite' => 2, 'prix_unitaire' => 100.51, 'tva_pourcent' => 20],
            ['designation' => 'C', 'quantite' => 1, 'prix_unitaire' => 100.49, 'tva_pourcent' => 20],
        ])->assertStatus(201)->json('data.id');

        $document = DocumentCommercial::with('lignes')->findOrFail($id);
        $this->assertSame(['104.17', '100.51', '100.49'], $document->lignes->pluck('prix_unitaire')->all());
        // Somme exacte des lignes = 614,02 → total HT arrondi à 614 ; TVA 20 % sur 614 = 122,80 ; TTC 736,80.
        $this->assertSame('614.00', $document->total_ht);
        $this->assertSame('614.00', $document->total_net_ht);
        $this->assertSame('122.80', $document->total_tva);
        $this->assertSame('736.80', $document->total_ttc);
    }

    public function test_6_mois_a_104_17_donnent_625_ht_125_de_tva_et_750_ttc(): void
    {
        $u = $this->admin();
        $c = $this->client();

        $id = $this->document($u, $c, [['designation' => 'Domiciliation', 'quantite' => 6, 'prix_unitaire' => 104.17, 'tva_pourcent' => 20]])
            ->assertStatus(201)->json('data.id');

        $document = DocumentCommercial::with('lignes')->findOrFail($id);
        $this->assertSame('104.17', $document->lignes->first()->prix_unitaire);
        $this->assertSame('625.00', $document->total_ht);
        $this->assertSame('125.00', $document->total_tva);
        $this->assertSame('750.00', $document->total_ttc);
    }

    public function test_modifier_un_document_garde_les_centimes_des_prix_et_recalcule_le_total_arrondi(): void
    {
        $u = $this->admin();
        $c = $this->client();
        $id = $this->document($u, $c, [['designation' => 'A', 'quantite' => 1, 'prix_unitaire' => 100]])->json('data.id');

        $this->actingAs($u)->putJson("/api/v1/facturation/facture/{$id}", ['lignes' => [
            ['designation' => 'A', 'quantite' => 1, 'prix_unitaire' => 104.17],
            ['designation' => 'B', 'quantite' => 1, 'prix_unitaire' => 99.50],
        ]])->assertOk();

        $document = DocumentCommercial::findOrFail($id);
        $this->assertSame(['104.17', '99.50'], $document->lignes()->orderBy('ordre')->pluck('prix_unitaire')->all());
        $this->assertSame('204.00', $document->total_ht); // 203,67 → 204
    }

    // ---- Quantités entières --------------------------------------------------------------------------------------

    public function test_une_quantite_decimale_est_refusee_pour_un_document(): void
    {
        $u = $this->admin();
        $c = $this->client();

        foreach ([1.5, '2,5', 'abc', '0.5'] as $i => $quantite) {
            $this->document($u, $c, [['designation' => 'A', 'quantite' => $quantite, 'prix_unitaire' => 100]], "Q-{$i}")
                ->assertStatus(422)->assertJsonValidationErrors(['lignes.0.quantite']);
        }
        $this->assertSame(0, DocumentCommercial::count());

        // Entiers (nombre ou texte) acceptés.
        $this->document($u, $c, [['designation' => 'A', 'quantite' => 3, 'prix_unitaire' => 100]], 'Q-OK1')->assertStatus(201);
        $this->document($u, $c, [['designation' => 'A', 'quantite' => '4', 'prix_unitaire' => 100]], 'Q-OK2')->assertStatus(201);
    }

    public function test_le_message_de_quantite_est_clair_et_la_modification_refuse_aussi_les_decimaux(): void
    {
        $u = $this->admin();
        $c = $this->client();
        $id = $this->document($u, $c, [['designation' => 'A', 'quantite' => 1, 'prix_unitaire' => 100]])->json('data.id');

        $reponse = $this->actingAs($u)->putJson("/api/v1/facturation/facture/{$id}", ['lignes' => [['designation' => 'A', 'quantite' => 1.5, 'prix_unitaire' => 100]]])
            ->assertStatus(422)->assertJsonValidationErrors(['lignes.0.quantite']);

        $this->assertStringContainsString('nombre entier', $reponse->json('errors')['lignes.0.quantite'][0]);
        $this->assertSame('1.00', DocumentCommercial::findOrFail($id)->lignes()->first()->quantite);
    }

    public function test_les_quantites_decimales_sont_refusees_pour_un_paiement_et_le_total_garde_ses_centimes(): void
    {
        $u = $this->admin();
        $c = $this->client();
        $payload = fn (array $ligne) => [
            'emetteur' => 'bureau_comptabilite', 'party_id' => $c->party_id, 'date_operation' => '2026-10-13',
            'lignes' => [$ligne + ['designation' => 'S']],
        ];

        $this->actingAs($u)->postJson('/api/v1/paiements', $payload(['quantite' => 2.5, 'prix_unitaire' => 100]))
            ->assertStatus(422)->assertJsonValidationErrors(['lignes.0.quantite']);

        $this->actingAs($u)->postJson('/api/v1/paiements', $payload(['quantite' => 2, 'prix_unitaire' => 104.17]))->assertStatus(201);
        $paiement = Paiement::with('lignes')->firstOrFail();
        $this->assertSame('104.17', $paiement->lignes->first()->prix_unitaire);
        $this->assertSame('208.34', $paiement->total); // 2 × 104,17 = 208,34 : le total d'un paiement n'est pas arrondi
    }

    // ---- Prix des services ---------------------------------------------------------------------------------------

    public function test_le_prix_d_un_service_garde_ses_centimes(): void
    {
        $u = $this->admin();

        $id = $this->actingAs($u)->postJson('/api/v1/services', ['nom' => 'Service HT', 'prix' => 104.17])->assertStatus(201)->json('id');
        $this->assertSame('104.17', Service::findOrFail($id)->prix);

        $this->actingAs($u)->putJson("/api/v1/services/{$id}", ['prix' => 100.80])->assertOk();
        $this->assertSame('100.80', Service::findOrFail($id)->prix);

        $this->actingAs($u)->putJson("/api/v1/services/{$id}", ['nom' => 'Service HT renommé', 'prix' => 100.80])->assertOk();
        $this->assertSame('100.80', Service::findOrFail($id)->prix);
    }
}
