<?php

namespace Tests\Feature;

use App\Models\Rapport;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class RapportTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create(['is_admin' => true]);
    }

    private function payload(array $override = []): array
    {
        return array_merge([
            'date_rapport' => '2026-09-15',
            'rapport_de' => 'Via Experts',
            'montant_restant' => 200,
            'revenu_local' => 0,
            'revenu_externe' => 3450,
            'depense_jour' => 0,
            'solde_caisse' => 200,
            'descriptive' => 'le solde de la caisse',
        ], $override);
    }

    public function test_guest_is_rejected(): void
    {
        $this->getJson('/api/v1/rapports')->assertStatus(401);
    }

    public function test_report_is_created_and_daily_revenue_is_computed(): void
    {
        // Reproduit la 1re ligne de la capture : 0 + 3450 = 3450.
        $this->actingAs($this->admin())
            ->postJson('/api/v1/rapports', $this->payload())
            ->assertStatus(201)
            ->assertJsonPath('totalRevenuJour', '3450.00')
            ->assertJsonPath('soldeCaisse', '200.00')
            ->assertJsonPath('rapportDe', 'Via Experts')
            ->assertJsonPath('status', 'actif');

        $this->assertDatabaseCount('rapports', 1);
    }

    public function test_daily_revenue_sums_local_and_external(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/v1/rapports', $this->payload(['revenu_local' => 1200, 'revenu_externe' => 800]))
            ->assertStatus(201)
            ->assertJsonPath('totalRevenuJour', '2000.00');
    }

    public function test_date_is_required(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/v1/rapports', ['montant_restant' => 10])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['date_rapport']);
    }

    public function test_update_recomputes_daily_revenue(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/rapports', $this->payload())->json('id');

        $this->actingAs($admin)
            ->postJson("/api/v1/rapports/{$id}", ['revenu_externe' => 1000])
            ->assertOk()
            ->assertJsonPath('totalRevenuJour', '1000.00');

        $this->assertSame('1000.00', Rapport::find($id)->total_revenu_jour);
    }

    public function test_document_is_really_stored_and_downloadable(): void
    {
        Storage::fake('public');
        $admin = $this->admin();

        $response = $this->actingAs($admin)->postJson('/api/v1/rapports', $this->payload([
            'document' => UploadedFile::fake()->create('archive.zip', 12, 'application/zip'),
        ]));

        $response->assertStatus(201)->assertJsonPath('documentNom', 'archive.zip');

        $rapport = Rapport::first();
        Storage::disk('public')->assertExists($rapport->document_chemin);

        $this->actingAs($admin)
            ->get("/api/v1/rapports/{$rapport->id}/document")
            ->assertOk()
            ->assertDownload('archive.zip');
    }

    public function test_download_is_404_without_document(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/rapports', $this->payload())->json('id');

        $this->actingAs($admin)->get("/api/v1/rapports/{$id}/document")->assertStatus(404);
    }

    public function test_archive_corbeille_restore_and_delete_cycle(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/rapports', $this->payload())->json('id');

        $this->actingAs($admin)->postJson("/api/v1/rapports/{$id}/archive")->assertJsonPath('status', 'archive');
        $this->actingAs($admin)->getJson('/api/v1/rapports?status=archive')->assertJsonCount(1);

        $this->actingAs($admin)->postJson("/api/v1/rapports/{$id}/restore")->assertJsonPath('status', 'actif');
        $this->actingAs($admin)->deleteJson("/api/v1/rapports/{$id}")->assertStatus(422);

        $this->actingAs($admin)->postJson("/api/v1/rapports/{$id}/corbeille")->assertJsonPath('status', 'corbeille');
        $this->actingAs($admin)->deleteJson("/api/v1/rapports/{$id}")->assertOk();

        $this->assertNull(Rapport::find($id));
        $this->assertNotNull(Rapport::withTrashed()->find($id)->deleted_at);
    }

    public function test_deleting_removes_the_stored_file(): void
    {
        Storage::fake('public');
        $admin = $this->admin();

        $this->actingAs($admin)->postJson('/api/v1/rapports', $this->payload([
            'document' => UploadedFile::fake()->create('archive.rar', 5),
        ]));

        $rapport = Rapport::first();
        $chemin = $rapport->document_chemin;
        Storage::disk('public')->assertExists($chemin);

        $this->actingAs($admin)->postJson("/api/v1/rapports/{$rapport->id}/corbeille");
        $this->actingAs($admin)->deleteJson("/api/v1/rapports/{$rapport->id}")->assertOk();

        Storage::disk('public')->assertMissing($chemin);
    }
}
