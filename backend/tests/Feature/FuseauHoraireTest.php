<?php

namespace Tests\Feature;

use App\Models\Note;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Fuseau horaire de l'application : Africa/Casablanca (heure légale du Maroc).
 * Les horodatages écrits par le serveur doivent être en heure locale du Maroc ; les dates saisies (champs « date »)
 * ne sont jamais converties.
 */
class FuseauHoraireTest extends TestCase
{
    use RefreshDatabase;

    public function test_l_application_et_php_utilisent_le_fuseau_du_maroc(): void
    {
        $this->assertSame('Africa/Casablanca', config('app.timezone'));
        $this->assertSame('Africa/Casablanca', date_default_timezone_get());
        $this->assertSame('Africa/Casablanca', now()->timezoneName);
    }

    public function test_les_horodatages_ecrits_par_le_serveur_sont_en_heure_locale_du_maroc(): void
    {
        // Heure figée : 07/10/2026 12:30:00 à Casablanca (= 11:30:00 UTC, le Maroc est en UTC+1 hors Ramadan).
        Carbon::setTestNow(Carbon::create(2026, 10, 7, 12, 30, 0, 'Africa/Casablanca'));
        $admin = User::factory()->create(['is_admin' => true]);

        $id = $this->actingAs($admin)->postJson('/api/v1/notes', ['titre' => 'Fuseau', 'contenu' => 'x'])->assertStatus(201)->json('id');

        $this->assertSame('2026-10-07 12:30:00', DB::table('notes')->where('id', $id)->value('created_at'), 'heure locale en base (et non 11:30 UTC)');
        // Format ISO 8601 exposé à l'interface : l'écart avec UTC est indiqué, le navigateur affiche donc 12:30.
        $this->assertSame('2026-10-07T12:30:00+01:00', Note::find($id)->created_at->toIso8601String());
        $this->assertSame('2026-10-07T12:30:00+01:00', $this->actingAs($admin)->getJson('/api/v1/notes')->json('0.createdAt'));

        Carbon::setTestNow();
    }

    public function test_une_date_saisie_n_est_jamais_decalee(): void
    {
        $admin = User::factory()->create(['is_admin' => true]);
        $this->seed(\Database\Seeders\PermissionSeeder::class);

        $id = $this->actingAs($admin)->postJson('/api/v1/rapports', [
            'emetteur' => 'bureau_comptabilite', 'date_rapport' => '2026-10-07', 'revenu_local' => 10,
        ])->assertStatus(201)->json('id');

        $this->assertSame('2026-10-07', substr((string) DB::table('rapports')->where('id', $id)->value('date_rapport'), 0, 10));
    }
}