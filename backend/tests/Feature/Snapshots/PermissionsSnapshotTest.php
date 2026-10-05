<?php

namespace Tests\Feature\Snapshots;

use App\Models\Permission;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\Snapshot;
use Tests\TestCase;

/**
 * Le catalogue de permissions (module → actions) créé par `PermissionSeeder` ne doit pas changer pendant
 * la migration Modular Monolith : les clés sont utilisées par les routes (`permission:module,action`),
 * par `User::hasPermission()` et par les droits déjà enregistrés pour chaque utilisateur.
 */
class PermissionsSnapshotTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_catalogue_de_permissions_est_inchange(): void
    {
        $this->seed(PermissionSeeder::class);

        $catalogue = [];
        foreach (Permission::orderBy('module')->orderBy('action')->get(['module', 'action']) as $p) {
            $catalogue[$p->module][] = $p->action;
        }
        ksort($catalogue);

        $this->assertNotEmpty($catalogue);
        Snapshot::assertMatches('permissions', $catalogue);
    }
}
