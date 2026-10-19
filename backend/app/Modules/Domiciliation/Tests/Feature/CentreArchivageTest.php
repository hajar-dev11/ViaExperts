<?php

namespace App\Modules\Domiciliation\Tests\Feature;

use App\Models\User;
use App\Modules\Domiciliation\Models\CentreDomiciliation;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Cycle Archiver → Archives → Restaurer d'un centre de domiciliation : le centre change de liste sans jamais être dupliqué
 * ni perdre de données, et les compteurs de la page Archive suivent.
 */
class CentreArchivageTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
        // La migration livre des centres de départ : les assertions portent sur des listes exactes, on part d'une table vide.
        DB::table('centres_domiciliation')->delete();
    }

    private function admin(): User
    {
        return User::factory()->create(['is_admin' => true]);
    }

    private function ids(User $u, string $status): array
    {
        return collect($this->actingAs($u)->getJson("/api/v1/centres-domiciliation?status={$status}&per_page=100")->assertOk()->json('data'))
            ->pluck('id')->all();
    }

    private function centre(string $nom): CentreDomiciliation
    {
        return CentreDomiciliation::create([
            'nom' => $nom, 'if' => '123456', 'ice' => '000111222000033', 'ville' => 'Casablanca',
            'adresse' => '1 rue du Test', 'numero_archive' => 'A-12', 'telephone' => '0600000000', 'email' => 'centre@example.test',
        ]);
    }

    public function test_un_centre_archive_quitte_la_liste_active_et_apparait_dans_les_archives(): void
    {
        $u = $this->admin();
        $a = $this->centre('CENTRE A');
        $b = $this->centre('CENTRE B');

        $this->actingAs($u)->postJson("/api/v1/centres-domiciliation/{$a->id}/archive")->assertOk()->assertJsonPath('status', 'archive');

        $this->assertSame([$b->id], $this->ids($u, 'actif'));
        $this->assertSame([$a->id], $this->ids($u, 'archive'));
        $this->assertSame([], $this->ids($u, 'corbeille'));
    }

    public function test_restaurer_remet_le_centre_dans_la_liste_active_sans_doublon_ni_perte_de_donnees(): void
    {
        $u = $this->admin();
        $a = $this->centre('CENTRE A');
        $avant = $a->fresh()->only(['nom', 'if', 'ice', 'ville', 'adresse', 'numero_archive', 'telephone', 'email']);
        $this->actingAs($u)->postJson("/api/v1/centres-domiciliation/{$a->id}/archive")->assertOk();

        $this->actingAs($u)->postJson("/api/v1/centres-domiciliation/{$a->id}/restore")->assertOk()->assertJsonPath('status', 'actif');

        $this->assertSame([$a->id], $this->ids($u, 'actif'), 'Le même centre, une seule fois.');
        $this->assertSame([], $this->ids($u, 'archive'));
        $this->assertSame(1, CentreDomiciliation::where('nom', 'CENTRE A')->count(), 'Aucun doublon créé.');
        $this->assertSame($avant, $a->fresh()->only(array_keys($avant)), 'Aucune donnée du centre n\'a changé.');
    }

    public function test_plusieurs_cycles_d_archivage_ne_dupliquent_rien(): void
    {
        $u = $this->admin();
        $a = $this->centre('CENTRE CYCLE');

        foreach (range(1, 3) as $_) {
            $this->actingAs($u)->postJson("/api/v1/centres-domiciliation/{$a->id}/archive")->assertOk();
            $this->actingAs($u)->postJson("/api/v1/centres-domiciliation/{$a->id}/restore")->assertOk();
        }

        $this->assertSame(1, CentreDomiciliation::count());
        $this->assertSame([$a->id], $this->ids($u, 'actif'));
    }

    public function test_les_compteurs_de_la_page_archive_suivent_l_archivage_et_la_restauration(): void
    {
        $u = $this->admin();
        $a = $this->centre('CENTRE COMPTE');
        $this->centre('CENTRE RESTE');

        $this->actingAs($u)->getJson('/api/v1/archive/counts?status=archive')->assertOk()->assertJsonPath('centres', 0);

        $this->actingAs($u)->postJson("/api/v1/centres-domiciliation/{$a->id}/archive")->assertOk();
        $this->actingAs($u)->getJson('/api/v1/archive/counts?status=archive')->assertOk()->assertJsonPath('centres', 1);
        $this->actingAs($u)->getJson('/api/v1/archive/counts?status=actif')->assertOk()->assertJsonPath('centres', 1);

        $this->actingAs($u)->postJson("/api/v1/centres-domiciliation/{$a->id}/restore")->assertOk();
        $this->actingAs($u)->getJson('/api/v1/archive/counts?status=archive')->assertOk()->assertJsonPath('centres', 0);
        $this->actingAs($u)->getJson('/api/v1/archive/counts?status=actif')->assertOk()->assertJsonPath('centres', 2);
    }

    public function test_un_centre_archive_se_retrouve_par_la_recherche_de_l_onglet_archives(): void
    {
        $u = $this->admin();
        $a = $this->centre('CENTRE INTROUVABLE');
        $this->centre('AUTRE CENTRE');
        $this->actingAs($u)->postJson("/api/v1/centres-domiciliation/{$a->id}/archive")->assertOk();

        $trouves = $this->actingAs($u)->getJson('/api/v1/centres-domiciliation?status=archive&search=INTROUVABLE')->assertOk()->json('data');

        $this->assertSame([$a->id], array_column($trouves, 'id'));
    }

    public function test_un_utilisateur_sans_permission_ne_peut_ni_archiver_ni_restaurer(): void
    {
        $staff = User::factory()->create(['is_admin' => false]);
        $a = $this->centre('CENTRE PROTEGE');

        $this->actingAs($staff)->postJson("/api/v1/centres-domiciliation/{$a->id}/archive")->assertStatus(403);
        $this->actingAs($staff)->postJson("/api/v1/centres-domiciliation/{$a->id}/restore")->assertStatus(403);
        $this->assertSame('actif', $a->fresh()->status);
    }
}
