<?php

namespace Tests\Feature;

use App\Models\CabinetSetting;
use App\Models\DomiciliationSetting;
use App\Models\Permission;
use App\Models\User;
use App\Models\UserPermission;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Identité d'impression (logo, cachet, pied de page) : accessible à tout utilisateur qui peut imprimer, sans donner accès
 * à la configuration de Paramètres, et sans jamais exposer plus que ce qui figure sur un document imprimé.
 */
class IdentiteImpressionTest extends TestCase
{
    use RefreshDatabase;

    private const CHAMPS = ['afficher_entreprise_info_recu', 'entreprise_info', 'gerant', 'logo_path', 'nom_societe', 'signature_path'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);

        // Certains tests de concurrence valident leurs lignes pour de vrai : on repart d'une table de réglages vide (annulé en fin de test).
        CabinetSetting::query()->delete();
        DomiciliationSetting::query()->delete();

        CabinetSetting::create([
            'nom_societe' => 'Bureau Test', 'logo_path' => 'settings/cabinet/logo.png', 'signature_path' => 'settings/cabinet/cachet.png',
            'entreprise_info' => 'Pied de page du bureau', 'afficher_entreprise_info_recu' => true,
            'ice_societe' => 'ICE-CONFIDENTIEL-1', 'facture_prochain_numero' => 4242, 'references_recu' => 'REF-INTERNE',
        ]);
        DomiciliationSetting::create([
            'nom_societe' => 'Centre Test', 'logo_path' => 'settings/domiciliation/logo.png', 'signature_path' => 'settings/domiciliation/cachet.png',
            'gerant' => 'Gérant Test', 'entreprise_info' => 'Pied de page du centre', 'prix_domiciliation' => 999.99,
            'ice_societe' => 'ICE-CONFIDENTIEL-2', 'facture_prochain_numero' => 777,
        ]);
    }

    private function utilisateurAvec(array $permissions = [], bool $admin = false): User
    {
        $user = User::factory()->create(['is_admin' => $admin]);
        foreach ($permissions as [$module, $action]) {
            UserPermission::create([
                'user_id' => $user->id,
                'permission_id' => Permission::where('module', $module)->where('action', $action)->firstOrFail()->id,
                'granted_at' => now(),
            ]);
        }

        return $user;
    }

    public function test_l_administrateur_lit_l_identite_des_deux_emetteurs(): void
    {
        $admin = $this->utilisateurAvec([], true);

        $bureau = $this->actingAs($admin)->getJson('/api/v1/impression/identite/bureau')->assertOk();
        $bureau->assertJsonPath('nom_societe', 'Bureau Test')
            ->assertJsonPath('logo_path', 'settings/cabinet/logo.png')
            ->assertJsonPath('signature_path', 'settings/cabinet/cachet.png')
            ->assertJsonPath('entreprise_info', 'Pied de page du bureau')
            ->assertJsonPath('afficher_entreprise_info_recu', true)
            ->assertJsonPath('gerant', null);

        $this->actingAs($admin)->getJson('/api/v1/impression/identite/via_experts')->assertOk()
            ->assertJsonPath('nom_societe', 'Centre Test')
            ->assertJsonPath('gerant', 'Gérant Test')
            ->assertJsonPath('signature_path', 'settings/domiciliation/cachet.png');
    }

    public function test_l_utilisateur_facturation_peut_lire_l_identite_sans_droit_parametres(): void
    {
        $facturation = $this->utilisateurAvec([['facturation', 'ajouter_facture'], ['facturation', 'liste_facture']]);

        $this->actingAs($facturation)->getJson('/api/v1/impression/identite/bureau')->assertOk()->assertJsonPath('nom_societe', 'Bureau Test');
        $this->actingAs($facturation)->getJson('/api/v1/impression/identite/via_experts')->assertOk()->assertJsonPath('nom_societe', 'Centre Test');

        // Aucun droit Paramètres n'a été donné : la configuration complète reste fermée.
        $this->actingAs($facturation)->getJson('/api/v1/settings/cabinet')->assertForbidden();
        $this->actingAs($facturation)->getJson('/api/v1/settings/domiciliation')->assertForbidden();
        $this->actingAs($facturation)->putJson('/api/v1/settings/cabinet', ['nom_societe' => 'Piraté'])->assertForbidden();
        $this->assertSame('Bureau Test', CabinetSetting::firstOrFail()->nom_societe);
    }

    public function test_chaque_module_d_impression_suffit(): void
    {
        foreach ([['paiements', 'list_paiements'], ['domiciliation', 'attestation'], ['mouvement', 'mouvement_entres_recu'], ['facturation', 'liste_devis']] as $permission) {
            $this->actingAs($this->utilisateurAvec([$permission]))->getJson('/api/v1/impression/identite/bureau')
                ->assertOk();
        }
    }

    public function test_un_utilisateur_sans_permission_d_impression_est_refuse(): void
    {
        $this->actingAs($this->utilisateurAvec())->getJson('/api/v1/impression/identite/bureau')->assertForbidden();
        $this->actingAs($this->utilisateurAvec([['clients', 'list'], ['entreprises', 'list'], ['cashet', 'list'], ['chat', 'list']]))
            ->getJson('/api/v1/impression/identite/via_experts')->assertForbidden();
    }

    public function test_un_visiteur_non_connecte_est_refuse(): void
    {
        $this->getJson('/api/v1/impression/identite/bureau')->assertUnauthorized();
    }

    public function test_un_emetteur_inconnu_donne_404(): void
    {
        $this->actingAs($this->utilisateurAvec([], true))->getJson('/api/v1/impression/identite/inconnu')->assertNotFound();
    }

    public function test_la_reponse_ne_contient_que_les_champs_d_impression_et_aucune_donnee_sensible(): void
    {
        $facturation = $this->utilisateurAvec([['facturation', 'ajouter_facture']]);

        foreach (['bureau', 'via_experts'] as $emetteur) {
            $json = $this->actingAs($facturation)->getJson("/api/v1/impression/identite/{$emetteur}")->assertOk()->json();

            $cles = array_keys($json);
            sort($cles);
            $this->assertSame(self::CHAMPS, $cles, "champs exposés pour {$emetteur}");

            $brut = json_encode($json);
            foreach (['ICE-CONFIDENTIEL', 'REF-INTERNE', '4242', '777', '999.99', 'prochain_numero', 'prefixe', 'prix_domiciliation'] as $secret) {
                $this->assertStringNotContainsString($secret, $brut, "« {$secret} » ne doit jamais sortir de cette route");
            }
        }
    }

    public function test_les_permissions_actuelles_des_routes_de_parametres_ne_changent_pas(): void
    {
        $parametres = $this->utilisateurAvec([['parametre', 'bureau_comptabilite']]);

        $this->actingAs($parametres)->getJson('/api/v1/settings/cabinet')->assertOk();
        $this->actingAs($parametres)->getJson('/api/v1/settings/domiciliation')->assertForbidden();
        // Un droit Paramètres seul n'est pas un droit d'impression.
        $this->actingAs($parametres)->getJson('/api/v1/impression/identite/bureau')->assertForbidden();
    }
}