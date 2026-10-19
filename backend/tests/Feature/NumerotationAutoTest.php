<?php

namespace Tests\Feature;

use App\Models\CabinetSetting;
use App\Models\Client;
use App\Models\DomiciliationSetting;
use App\Models\Party;
use App\Models\User;
use App\Modules\Facturation\Models\DocumentCommercial;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Numérotation automatique : le numéro vient de la numérotation de l'émetteur choisi (Centre de domiciliation = Via Experts,
 * ou Bureau de comptabilité), est attribué par le SERVEUR sous verrou en mode `numero_auto`, n'est jamais partagé entre deux
 * créations, et un numéro saisi à la main reste contrôlé.
 */
class NumerotationAutoTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);

        CabinetSetting::firstOrCreate([])->forceFill([
            'facture_prefixe' => 'FAC-', 'facture_prochain_numero' => 10, 'facture_suffixe' => '/26',
            'devis_prefixe' => 'DEV-', 'devis_prochain_numero' => 5, 'devis_suffixe' => null,
            'bl_prefixe' => 'BL-', 'bl_prochain_numero' => 3, 'bl_suffixe' => null,
            'avoir_prefixe' => 'AV-', 'avoir_prochain_numero' => 1, 'avoir_suffixe' => null,
        ])->save();
        DomiciliationSetting::firstOrCreate([])->forceFill([
            'facture_prefixe' => 'VE-', 'facture_prochain_numero' => 200, 'facture_suffixe' => '/V',
            'devis_prefixe' => 'VD-', 'devis_prochain_numero' => 20, 'devis_suffixe' => null,
        ])->save();
    }

    private function admin(): User
    {
        return User::factory()->create(['is_admin' => true]);
    }

    private function party(): Party
    {
        $party = Party::create(['type' => 'client', 'status' => 'actif']);
        Client::create(['party_id' => $party->id, 'type' => 'client', 'genre' => 'M', 'nom' => 'CLIENT TEST']);

        return $party;
    }

    private function creer(User $u, Party $p, string $type, string $emetteur, array $plus = [])
    {
        return $this->actingAs($u)->postJson("/api/v1/facturation/{$type}", array_merge([
            'emetteur' => $emetteur, 'party_id' => $p->id, 'date_document' => '2026-10-13',
            'lignes' => [['designation' => 'S', 'quantite' => 1, 'prix_unitaire' => 100]],
        ], $plus));
    }

    public function test_le_numero_propose_depend_de_l_emetteur_choisi_et_change_quand_on_change_d_emetteur(): void
    {
        $u = $this->admin();

        $bureau = $this->actingAs($u)->getJson('/api/v1/facturation/facture/numero-propose?emetteur=bureau_comptabilite')->assertOk()->json('numero');
        $centre = $this->actingAs($u)->getJson('/api/v1/facturation/facture/numero-propose?emetteur=via_experts')->assertOk()->json('numero');

        $this->assertSame('FAC-10/26', $bureau);
        $this->assertSame('VE-200/V', $centre);
        // Revenir à l'émetteur précédent redonne SON numéro (jamais celui de la sélection précédente).
        $this->assertSame('FAC-10/26', $this->actingAs($u)->getJson('/api/v1/facturation/facture/numero-propose?emetteur=bureau_comptabilite')->json('numero'));
    }

    public function test_le_serveur_attribue_le_numero_de_l_emetteur_et_fait_avancer_son_compteur_seulement(): void
    {
        $u = $this->admin();
        $p = $this->party();

        $this->creer($u, $p, 'facture', 'via_experts', ['numero_auto' => true])->assertStatus(201)->assertJsonPath('data.numero', 'VE-200/V');
        $this->creer($u, $p, 'facture', 'bureau_comptabilite', ['numero_auto' => true])->assertStatus(201)->assertJsonPath('data.numero', 'FAC-10/26');

        $this->assertSame(201, (int) DomiciliationSetting::first()->facture_prochain_numero);
        $this->assertSame(11, (int) CabinetSetting::first()->facture_prochain_numero);
    }

    public function test_deux_creations_successives_n_obtiennent_jamais_le_meme_numero(): void
    {
        $u = $this->admin();
        $p = $this->party();

        // Les deux écrans ont reçu la MÊME proposition (FAC-10/26) : le serveur attribue FAC-10 puis FAC-11.
        $a = $this->creer($u, $p, 'facture', 'bureau_comptabilite', ['numero_auto' => true, 'numero' => 'FAC-10/26'])->assertStatus(201)->json('data.numero');
        $b = $this->creer($u, $p, 'facture', 'bureau_comptabilite', ['numero_auto' => true, 'numero' => 'FAC-10/26'])->assertStatus(201)->json('data.numero');

        $this->assertSame(['FAC-10/26', 'FAC-11/26'], [$a, $b]);
        $this->assertSame(2, DocumentCommercial::where('type', 'facture')->distinct()->count('numero'));
    }

    public function test_le_compteur_saute_un_numero_deja_pris_a_la_main(): void
    {
        $u = $this->admin();
        $p = $this->party();

        // Numéro saisi à la main = celui que le compteur proposerait : le compteur avance (même numéro), puis le suivant est libre.
        $this->creer($u, $p, 'facture', 'bureau_comptabilite', ['numero' => 'FAC-11/26'])->assertStatus(201); // manuel, n'avance pas
        $a = $this->creer($u, $p, 'facture', 'bureau_comptabilite', ['numero_auto' => true])->assertStatus(201)->json('data.numero');
        $b = $this->creer($u, $p, 'facture', 'bureau_comptabilite', ['numero_auto' => true])->assertStatus(201)->json('data.numero');

        $this->assertSame('FAC-10/26', $a);
        $this->assertSame('FAC-12/26', $b, 'FAC-11/26 est déjà pris : il est sauté.');
    }

    public function test_un_numero_saisi_a_la_main_est_controle_et_ne_deplace_pas_le_compteur(): void
    {
        $u = $this->admin();
        $p = $this->party();

        $this->creer($u, $p, 'facture', 'bureau_comptabilite', ['numero' => 'PERSO-1'])->assertStatus(201)->assertJsonPath('data.numero', 'PERSO-1');
        $this->assertSame(10, (int) CabinetSetting::first()->facture_prochain_numero);

        $this->creer($u, $p, 'facture', 'bureau_comptabilite', ['numero' => 'PERSO-1'])->assertStatus(422)->assertJsonValidationErrors(['numero']);
        // Sans numéro et sans mode automatique : refusé.
        $this->creer($u, $p, 'facture', 'bureau_comptabilite')->assertStatus(422)->assertJsonValidationErrors(['numero']);
    }

    public function test_chaque_type_de_document_a_son_propre_compteur(): void
    {
        $u = $this->admin();
        $p = $this->party();

        foreach (['facture' => 'FAC-10/26', 'devis' => 'DEV-5', 'bl' => 'BL-3', 'avoir' => 'AV-1'] as $type => $attendu) {
            $this->creer($u, $p, $type, 'bureau_comptabilite', ['numero_auto' => true])->assertStatus(201)->assertJsonPath('data.numero', $attendu);
        }
        $this->creer($u, $p, 'devis', 'via_experts', ['numero_auto' => true])->assertStatus(201)->assertJsonPath('data.numero', 'VD-20');
    }

    public function test_une_numerotation_non_configuree_donne_une_erreur_claire_sans_creer_de_document(): void
    {
        $u = $this->admin();
        $p = $this->party();

        // Le Centre de domiciliation n'a pas de numérotation pour les bons de livraison.
        $reponse = $this->creer($u, $p, 'bl', 'via_experts', ['numero_auto' => true])->assertStatus(422)->assertJsonValidationErrors(['numero']);

        $this->assertStringContainsString('numérotation automatique', $reponse->json('errors.numero.0'));
        $this->assertSame(0, DocumentCommercial::where('type', 'bl')->count());
    }

    public function test_un_document_cree_avec_le_numero_auto_ne_peut_pas_etre_cree_deux_fois_avec_le_meme_numero(): void
    {
        $u = $this->admin();
        $p = $this->party();
        $premier = $this->creer($u, $p, 'facture', 'bureau_comptabilite', ['numero_auto' => true])->json('data.numero');

        // Un client qui renvoie à la main le numéro déjà attribué est refusé : jamais de doublon.
        $this->creer($u, $p, 'facture', 'bureau_comptabilite', ['numero' => $premier])->assertStatus(422)->assertJsonValidationErrors(['numero']);
        $this->assertSame(1, DocumentCommercial::where('numero', $premier)->count());
    }
}
