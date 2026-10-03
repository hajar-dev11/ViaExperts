<?php

namespace Tests\Feature;

use App\Models\CentreDomiciliation;
use App\Models\Entreprise;
use App\Models\Party;
use App\Models\ServiceStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SettingsTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create(['is_admin' => true]);
    }

    private function staff(): User
    {
        return User::factory()->create(['is_admin' => false]);
    }

    // --- Profil (self-service, tout utilisateur authentifié) ---

    public function test_authenticated_user_can_update_own_profile(): void
    {
        $user = $this->staff();

        $response = $this->actingAs($user)->putJson('/api/v1/profile', [
            'name' => 'Nouveau Nom',
            'telephone' => '0611112222',
            'email' => $user->email,
        ]);

        $response->assertOk()->assertJsonPath('user.name', 'Nouveau Nom');
        $this->assertDatabaseHas('users', ['id' => $user->id, 'name' => 'Nouveau Nom']);
    }

    public function test_profile_password_change_requires_correct_current_password(): void
    {
        $user = User::factory()->create(['password' => Hash::make('ancien-mdp')]);

        $response = $this->actingAs($user)->putJson('/api/v1/profile', [
            'name' => $user->name,
            'email' => $user->email,
            'current_password' => 'mauvais-mdp',
            'password' => 'nouveau-mdp-123',
            'password_confirmation' => 'nouveau-mdp-123',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('current_password');
    }

    public function test_profile_password_change_succeeds_with_correct_current_password(): void
    {
        $user = User::factory()->create(['password' => Hash::make('ancien-mdp')]);

        $response = $this->actingAs($user)->putJson('/api/v1/profile', [
            'name' => $user->name,
            'email' => $user->email,
            'current_password' => 'ancien-mdp',
            'password' => 'nouveau-mdp-123',
            'password_confirmation' => 'nouveau-mdp-123',
        ]);

        $response->assertOk();
        $this->assertTrue(Hash::check('nouveau-mdp-123', $user->fresh()->password));
    }

    public function test_guest_cannot_update_profile(): void
    {
        $this->putJson('/api/v1/profile', ['name' => 'X', 'email' => 'x@x.com'])->assertStatus(401);
    }

    public function test_user_can_upload_and_delete_own_profile_photo(): void
    {
        Storage::fake('public');
        $user = $this->staff();

        $upload = $this->actingAs($user)->postJson('/api/v1/profile/photo', [
            'file' => UploadedFile::fake()->create('avatar.png', 40, 'image/png'),
        ]);
        $upload->assertOk();
        $path = $upload->json('user.photo_path');
        $this->assertNotNull($path);
        Storage::disk('public')->assertExists($path);
        $this->assertDatabaseHas('users', ['id' => $user->id, 'photo_path' => $path]);

        $delete = $this->actingAs($user)->deleteJson('/api/v1/profile/photo');
        $delete->assertOk()->assertJsonPath('user.photo_path', null);
        Storage::disk('public')->assertMissing($path);
    }

    public function test_profile_photo_rejects_non_image(): void
    {
        Storage::fake('public');

        $this->actingAs($this->staff())->postJson('/api/v1/profile/photo', [
            'file' => UploadedFile::fake()->create('document.pdf', 40, 'application/pdf'),
        ])->assertStatus(422)->assertJsonValidationErrors('file');
    }

    // --- Bureau de Comptabilité (admin uniquement) ---

    public function test_admin_can_save_and_read_back_cabinet_settings(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->putJson('/api/v1/settings/cabinet', [
            'nom_societe' => 'Maitre : Test Bendeq',
            'facture_prefixe' => 'FAC-',
            'facture_prochain_numero' => 300,
            'facture_suffixe' => '/26',
        ])->assertOk();

        $response = $this->actingAs($admin)->getJson('/api/v1/settings/cabinet');
        $response->assertOk()
            ->assertJsonPath('nom_societe', 'Maitre : Test Bendeq')
            ->assertJsonPath('facture_prochain_numero', 300);

        $this->assertDatabaseHas('cabinet_settings', ['nom_societe' => 'Maitre : Test Bendeq']);
    }

    public function test_admin_can_upload_and_reset_cabinet_logo(): void
    {
        Storage::fake('public');
        $admin = $this->admin();

        $upload = $this->actingAs($admin)->postJson('/api/v1/settings/cabinet/logo', [
            'file' => UploadedFile::fake()->create('logo.png', 50, 'image/png'),
        ]);
        $upload->assertOk();
        $path = $upload->json('logo_path');
        $this->assertNotNull($path);
        Storage::disk('public')->assertExists($path);

        $reset = $this->actingAs($admin)->deleteJson('/api/v1/settings/cabinet/logo');
        $reset->assertOk()->assertJsonPath('logo_path', null);
        Storage::disk('public')->assertMissing($path);
    }

    public function test_cabinet_logo_upload_rejects_oversized_file(): void
    {
        Storage::fake('public');
        $admin = $this->admin();

        $this->actingAs($admin)->postJson('/api/v1/settings/cabinet/logo', [
            'file' => UploadedFile::fake()->create('logo.png', 900, 'image/png'),
        ])->assertStatus(422)->assertJsonValidationErrors('file');
    }

    public function test_staff_cannot_access_cabinet_settings(): void
    {
        $this->actingAs($this->staff())->getJson('/api/v1/settings/cabinet')->assertStatus(403);
        $this->actingAs($this->staff())->putJson('/api/v1/settings/cabinet', ['nom_societe' => 'X'])->assertStatus(403);
    }

    // --- Centre de Domiciliation — formulaire de paramètres (admin uniquement) ---

    public function test_admin_can_save_and_read_back_domiciliation_settings(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->putJson('/api/v1/settings/domiciliation', [
            'nom_societe' => 'Via Experts',
            'gerant' => 'Test Gérant',
            'prix_domiciliation' => 150.5,
        ])->assertOk();

        $response = $this->actingAs($admin)->getJson('/api/v1/settings/domiciliation');
        $response->assertOk()->assertJsonPath('gerant', 'Test Gérant');

        $this->assertDatabaseHas('domiciliation_settings', ['gerant' => 'Test Gérant']);
    }

    public function test_admin_can_upload_and_reset_domiciliation_signature(): void
    {
        Storage::fake('public');
        $admin = $this->admin();

        $upload = $this->actingAs($admin)->postJson('/api/v1/settings/domiciliation/signature', [
            'file' => UploadedFile::fake()->create('signature.png', 50, 'image/png'),
        ]);
        $upload->assertOk();
        $path = $upload->json('signature_path');
        $this->assertNotNull($path);
        Storage::disk('public')->assertExists($path);

        $reset = $this->actingAs($admin)->deleteJson('/api/v1/settings/domiciliation/signature');
        $reset->assertOk()->assertJsonPath('signature_path', null);
        Storage::disk('public')->assertMissing($path);
    }

    // --- Centres de domiciliation — CRUD réel (admin uniquement), table déjà existante ---

    public function test_admin_can_list_search_and_paginate_centres(): void
    {
        CentreDomiciliation::create(['nom' => 'Centre QA 1']);
        CentreDomiciliation::create(['nom' => 'Centre QA 2']);
        CentreDomiciliation::create(['nom' => 'Centre QA 3']);
        $admin = $this->admin();

        $response = $this->actingAs($admin)->getJson('/api/v1/centres-domiciliation?per_page=10');
        $response->assertOk()->assertJsonStructure(['data', 'current_page', 'per_page', 'total']);
    }

    public function test_admin_can_create_update_and_delete_a_centre(): void
    {
        $admin = $this->admin();

        $create = $this->actingAs($admin)->postJson('/api/v1/centres-domiciliation', [
            'nom' => 'Centre Test QA',
            'ville' => 'Casablanca',
        ]);
        $create->assertStatus(201)->assertJsonPath('nom', 'Centre Test QA');
        $id = $create->json('id');

        $this->actingAs($admin)->putJson("/api/v1/centres-domiciliation/{$id}", [
            'nom' => 'Centre Test QA Modifié',
        ])->assertOk()->assertJsonPath('nom', 'Centre Test QA Modifié');

        $this->assertDatabaseHas('centres_domiciliation', ['id' => $id, 'nom' => 'Centre Test QA Modifié']);

        // La suppression définitive exige de passer par la Corbeille au préalable
        // (même règle que partout ailleurs dans l'application).
        $this->actingAs($admin)->postJson("/api/v1/centres-domiciliation/{$id}/corbeille")->assertOk();
        $this->actingAs($admin)->deleteJson("/api/v1/centres-domiciliation/{$id}")->assertOk();
        $this->assertSoftDeleted('centres_domiciliation', ['id' => $id]);
    }

    public function test_admin_cannot_delete_a_centre_outside_the_corbeille(): void
    {
        $admin = $this->admin();
        $centre = CentreDomiciliation::create(['nom' => 'Centre QA Pas Encore Corbeille']);

        $this->actingAs($admin)->deleteJson("/api/v1/centres-domiciliation/{$centre->id}")->assertStatus(422);
        $this->assertDatabaseHas('centres_domiciliation', ['id' => $centre->id]);
    }

    public function test_cannot_delete_centre_referenced_by_an_entreprise(): void
    {
        $admin = $this->admin();
        $centre = CentreDomiciliation::create(['nom' => 'Centre QA Référencé']);

        $party = Party::create(['type' => 'entreprise', 'status' => 'actif']);
        Entreprise::create([
            'party_id' => $party->id,
            'type' => 'entreprise',
            'denomination' => 'Entreprise QA',
            'centre_domiciliation_id' => $centre->id,
        ]);

        $response = $this->actingAs($admin)->deleteJson("/api/v1/centres-domiciliation/{$centre->id}");
        $response->assertStatus(422);
        $this->assertDatabaseHas('centres_domiciliation', ['id' => $centre->id]);
    }

    public function test_staff_cannot_manage_centres(): void
    {
        $this->actingAs($this->staff())->getJson('/api/v1/centres-domiciliation')->assertStatus(403);
        $this->actingAs($this->staff())->postJson('/api/v1/centres-domiciliation', ['nom' => 'X'])->assertStatus(403);
    }

    // --- Statuts de service (admin uniquement) ---

    public function test_admin_can_create_update_and_delete_a_service_status(): void
    {
        $admin = $this->admin();

        $create = $this->actingAs($admin)->postJson('/api/v1/service-statuses', [
            'nom' => 'Statut QA',
            'couleur_texte' => '#16A34A',
            'couleur_fond' => '#DCFCE7',
        ]);
        $create->assertStatus(201)->assertJsonPath('nom', 'Statut QA');
        $id = $create->json('id');

        $this->actingAs($admin)->putJson("/api/v1/service-statuses/{$id}", [
            'nom' => 'Statut QA Modifié',
            'couleur_texte' => '#16A34A',
            'couleur_fond' => '#DCFCE7',
        ])->assertOk()->assertJsonPath('nom', 'Statut QA Modifié');

        $this->actingAs($admin)->deleteJson("/api/v1/service-statuses/{$id}")->assertOk();
        $this->assertDatabaseMissing('service_statuses', ['id' => $id]);
    }

    public function test_service_status_rejects_invalid_color(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->postJson('/api/v1/service-statuses', [
            'nom' => 'Statut Invalide',
            'couleur_texte' => 'rouge',
            'couleur_fond' => '#DCFCE7',
        ])->assertStatus(422)->assertJsonValidationErrors('couleur_texte');
    }

    public function test_service_status_name_must_be_unique(): void
    {
        ServiceStatus::create(['nom' => 'Doublon', 'couleur_texte' => '#000000', 'couleur_fond' => '#FFFFFF']);
        $admin = $this->admin();

        $this->actingAs($admin)->postJson('/api/v1/service-statuses', [
            'nom' => 'Doublon',
            'couleur_texte' => '#16A34A',
            'couleur_fond' => '#DCFCE7',
        ])->assertStatus(422)->assertJsonValidationErrors('nom');
    }

    public function test_admin_can_search_and_change_page_size_for_service_statuses(): void
    {
        ServiceStatus::create(['nom' => 'Alpha Statut', 'couleur_texte' => '#000000', 'couleur_fond' => '#FFFFFF']);
        ServiceStatus::create(['nom' => 'Beta Statut', 'couleur_texte' => '#000000', 'couleur_fond' => '#FFFFFF']);
        $admin = $this->admin();

        $response = $this->actingAs($admin)->getJson('/api/v1/service-statuses?search=Alpha&per_page=25');
        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertEquals(25, $response->json('per_page'));
    }

    public function test_staff_cannot_manage_service_statuses(): void
    {
        $this->actingAs($this->staff())->getJson('/api/v1/service-statuses')->assertStatus(403);
    }

    // --- Statuts Cachet / Mail (mêmes règles que les statuts de service) ---

    public function test_admin_can_manage_cachet_statuses(): void
    {
        $admin = $this->admin();

        $create = $this->actingAs($admin)->postJson('/api/v1/cachet-statuses', [
            'nom' => 'Réception',
            'couleur_texte' => '#FFFFFF',
            'couleur_fond' => '#16A34A',
        ]);
        $create->assertStatus(201)->assertJsonPath('nom', 'Réception');
        $id = $create->json('id');

        $this->actingAs($admin)->putJson("/api/v1/cachet-statuses/{$id}", [
            'nom' => 'RETRAIT',
            'couleur_texte' => '#FFFFFF',
            'couleur_fond' => '#DC2626',
        ])->assertOk()->assertJsonPath('nom', 'RETRAIT');

        $this->assertDatabaseHas('cachet_statuses', ['id' => $id, 'nom' => 'RETRAIT']);

        $this->actingAs($admin)->deleteJson("/api/v1/cachet-statuses/{$id}")->assertOk();
        $this->assertDatabaseMissing('cachet_statuses', ['id' => $id]);
    }

    public function test_admin_can_manage_mail_statuses(): void
    {
        $admin = $this->admin();

        $create = $this->actingAs($admin)->postJson('/api/v1/mail-statuses', [
            'nom' => 'Archives',
            'couleur_texte' => '#FFFFFF',
            'couleur_fond' => '#2563EB',
        ]);
        $create->assertStatus(201);
        $id = $create->json('id');

        $this->actingAs($admin)->deleteJson("/api/v1/mail-statuses/{$id}")->assertOk();
        $this->assertDatabaseMissing('mail_statuses', ['id' => $id]);
    }

    public function test_cachet_and_mail_statuses_support_search_and_page_size(): void
    {
        \App\Models\CachetStatus::create(['nom' => 'Alpha Cachet', 'couleur_texte' => '#000000', 'couleur_fond' => '#FFFFFF']);
        \App\Models\CachetStatus::create(['nom' => 'Beta Cachet', 'couleur_texte' => '#000000', 'couleur_fond' => '#FFFFFF']);
        \App\Models\MailStatus::create(['nom' => 'Alpha Mail', 'couleur_texte' => '#000000', 'couleur_fond' => '#FFFFFF']);
        $admin = $this->admin();

        $cachet = $this->actingAs($admin)->getJson('/api/v1/cachet-statuses?search=Alpha&per_page=25');
        $cachet->assertOk();
        $this->assertCount(1, $cachet->json('data'));
        $this->assertEquals(25, $cachet->json('per_page'));

        $mail = $this->actingAs($admin)->getJson('/api/v1/mail-statuses?search=Alpha');
        $mail->assertOk();
        $this->assertCount(1, $mail->json('data'));
    }

    public function test_staff_cannot_manage_cachet_or_mail_statuses(): void
    {
        $staff = $this->staff();
        $this->actingAs($staff)->getJson('/api/v1/cachet-statuses')->assertStatus(403);
        $this->actingAs($staff)->getJson('/api/v1/mail-statuses')->assertStatus(403);
    }
}
