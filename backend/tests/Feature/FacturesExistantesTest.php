<?php

namespace Tests\Feature;

use App\Models\DeclarationTva;
use App\Models\Entreprise;
use App\Models\Party;
use App\Models\Permission;
use App\Models\User;
use App\Models\UserPermission;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Avertissement « doublon » : l'API renvoie les factures DÉJÀ ENREGISTRÉES portant un numéro donné (même type, même entreprise,
 * déclarations actives). Lecture seule : elle ne bloque, ne modifie et ne fusionne rien — l'enregistrement reste libre.
 */
class FacturesExistantesTest extends TestCase
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

    private function entreprise(string $nom = 'ENTREPRISE A'): Entreprise
    {
        $party = Party::create(['type' => 'entreprise', 'status' => 'actif']);

        return Entreprise::create(['party_id' => $party->id, 'type' => 'entreprise', 'denomination' => $nom]);
    }

    private function payload(Entreprise $entreprise, array $lignes): array
    {
        return [
            'entreprise_id' => $entreprise->party_id, 'client_if' => '12345678', 'identifiant_paiement' => '1-ESPECES',
            'periode_type' => 'trimestre', 'periode_valeur' => 2, 'annee' => 2026, 'regime' => '2', 'lignes' => $lignes,
        ];
    }

    private function ligne(string $numero, string $fournisseur = '111', array $extra = []): array
    {
        return array_merge(['fact_num' => $numero, 'ht' => 1000, 'tva' => 200, 'ttc' => 1200, 'taux' => 20, 'identifiant_fiscal' => $fournisseur], $extra);
    }

    private function verifier(User $admin, string $type, Entreprise $entreprise, array $numeros, ?int $exclure = null)
    {
        return $this->actingAs($admin)->postJson("/api/v1/declarations/{$type}/factures-existantes", array_filter([
            'entreprise_id' => $entreprise->party_id, 'numeros' => $numeros, 'exclure' => $exclure,
        ]));
    }

    public function test_retrouve_les_factures_enregistrees_sans_tenir_compte_de_la_casse_ni_des_espaces(): void
    {
        $admin = $this->admin();
        $entreprise = $this->entreprise();
        $this->actingAs($admin)->postJson('/api/v1/declarations/tva', $this->payload($entreprise, [
            $this->ligne('FA 12', '111', ['libelle_fournisseur' => 'FOURNISSEUR X', 'ice' => '001']), $this->ligne('F-2', '222'),
        ]))->assertStatus(201);

        $reponse = $this->verifier($admin, 'tva', $entreprise, ['fa12', 'F-404'])->assertOk();

        $reponse->assertJsonCount(1);
        $reponse->assertJsonPath('0.factNum', 'FA 12');
        $reponse->assertJsonPath('0.identifiantFiscal', '111');
        $reponse->assertJsonPath('0.ice', '001');
        $reponse->assertJsonPath('0.libelleFournisseur', 'FOURNISSEUR X');
        $this->assertNotNull($reponse->json('0.declarationId'));
    }

    public function test_perimetre_meme_type_meme_entreprise_declarations_actives_et_declaration_en_cours_exclue(): void
    {
        $admin = $this->admin();
        $a = $this->entreprise('A');
        $b = $this->entreprise('B');

        $tva = $this->actingAs($admin)->postJson('/api/v1/declarations/tva', $this->payload($a, [$this->ligne('F-1')]))->json('data.id');
        $this->actingAs($admin)->postJson('/api/v1/declarations/chiffre_affaire', $this->payload($a, [$this->ligne('F-1')]))->assertStatus(201);
        $this->actingAs($admin)->postJson('/api/v1/declarations/tva', $this->payload($b, [$this->ligne('F-1')]))->assertStatus(201);

        // Même type et même entreprise seulement : ni le chiffre d'affaire, ni l'autre entreprise.
        $this->verifier($admin, 'tva', $a, ['F-1'])->assertOk()->assertJsonCount(1);
        $this->verifier($admin, 'chiffre_affaire', $a, ['F-1'])->assertOk()->assertJsonCount(1);
        $this->verifier($admin, 'tva', $this->entreprise('C'), ['F-1'])->assertOk()->assertJsonCount(0);

        // En modifiant une déclaration, ses propres lignes ne sont pas des doublons d'elles-mêmes.
        $this->verifier($admin, 'tva', $a, ['F-1'], $tva)->assertOk()->assertJsonCount(0);

        // Une déclaration archivée ou à la corbeille n'est plus une donnée « en vigueur ».
        $this->actingAs($admin)->postJson("/api/v1/declarations/tva/{$tva}/archive")->assertOk();
        $this->verifier($admin, 'tva', $a, ['F-1'])->assertOk()->assertJsonCount(0);
    }

    public function test_les_avertissements_ne_bloquent_jamais_l_enregistrement(): void
    {
        $admin = $this->admin();
        $entreprise = $this->entreprise();

        // Même numéro, même fournisseur, deux fois dans la même déclaration PUIS dans une seconde : tout s'enregistre.
        $this->actingAs($admin)->postJson('/api/v1/declarations/tva', $this->payload($entreprise, [
            $this->ligne('F-1'), $this->ligne('F-1'),
        ]))->assertStatus(201);
        $this->actingAs($admin)->postJson('/api/v1/declarations/tva', $this->payload($entreprise, [$this->ligne('F-1')]))->assertStatus(201);

        // Espèces au-dessus de 5 000 Dh : enregistré aussi (5 000 comme 5 001, ou un autre mode de paiement).
        foreach ([5000, 5001, 9000] as $ttc) {
            $this->actingAs($admin)->postJson('/api/v1/declarations/tva', $this->payload($entreprise, [
                $this->ligne("E-{$ttc}", '111', ['ttc' => $ttc, 'id_paie' => '1-ESPECES']),
            ]))->assertStatus(201);
        }
        $this->actingAs($admin)->postJson('/api/v1/declarations/chiffre_affaire', $this->payload($entreprise, [
            $this->ligne('F-1'), $this->ligne('F-1', '111', ['ttc' => 8000, 'id_paie' => '2-VIREMENT']),
        ]))->assertStatus(201);

        // Rien n'a été supprimé, fusionné ni modifié automatiquement : toutes les lignes sont en base.
        $this->assertSame(6, DeclarationTva::count());
        $this->assertSame(2, DeclarationTva::where('type', 'tva')->first()->lignes()->count());
        $this->verifier($admin, 'tva', $entreprise, ['F-1'])->assertOk()->assertJsonCount(3);
    }

    private function especes(User $admin, string $type, Entreprise $entreprise, int $annee = 2026, ?int $exclure = null)
    {
        return $this->actingAs($admin)->postJson("/api/v1/declarations/{$type}/especes-existantes", array_filter([
            'entreprise_id' => $entreprise->party_id, 'annee' => $annee, 'exclure' => $exclure,
        ]));
    }

    public function test_especes_existantes_ne_renvoie_que_les_reglements_en_especes_du_bon_perimetre(): void
    {
        $admin = $this->admin();
        $a = $this->entreprise('A');
        $b = $this->entreprise('B');

        // Déclaration TVA de A (en-tête « espèces ») : une ligne sans ID PAIE (espèces par l'en-tête), une par virement, une par chèque.
        $tva = $this->actingAs($admin)->postJson('/api/v1/declarations/tva', $this->payload($a, [
            $this->ligne('E-1', '111', ['ttc' => 4000]),
            $this->ligne('V-1', '111', ['ttc' => 7000, 'id_paie' => '4-VIREMENT']),
            $this->ligne('C-1', '111', ['ttc' => 800, 'id_paie' => '2-CHEQUE']),
            $this->ligne('E-2', '222', ['ttc' => 300, 'id_paie' => '1-ESPECES']),
        ]))->json('data.id');
        // Même entreprise mais en-tête « virement » : une ligne explicitement en espèces reste en espèces.
        $this->actingAs($admin)->postJson('/api/v1/declarations/tva', array_merge($this->payload($a, [
            $this->ligne('E-3', '111', ['ttc' => 500, 'id_paie' => '1-ESPECES']), $this->ligne('V-2', '111', ['ttc' => 900]),
        ]), ['identifiant_paiement' => '4-VIREMENT']))->assertStatus(201);
        // Autres périmètres : autre année, autre type, autre entreprise.
        $this->actingAs($admin)->postJson('/api/v1/declarations/tva', array_merge($this->payload($a, [$this->ligne('E-9', '111', ['ttc' => 6000])]), ['annee' => 2025]))->assertStatus(201);
        $this->actingAs($admin)->postJson('/api/v1/declarations/chiffre_affaire', $this->payload($a, [$this->ligne('E-8', '111', ['ttc' => 6000])]))->assertStatus(201);
        $this->actingAs($admin)->postJson('/api/v1/declarations/tva', $this->payload($b, [$this->ligne('E-7', '111', ['ttc' => 6000])]))->assertStatus(201);

        $reponse = $this->especes($admin, 'tva', $a)->assertOk();
        $this->assertEqualsCanonicalizing(['E-1', 'E-2', 'E-3'], array_column($reponse->json(), 'factNum'));
        $this->assertSame('4000.00', collect($reponse->json())->firstWhere('factNum', 'E-1')['ttc']);
        $this->assertSame('111', collect($reponse->json())->firstWhere('factNum', 'E-3')['identifiantFiscal']);

        // La déclaration en cours de modification est exclue (ses lignes sont dans le tableau).
        $this->assertEqualsCanonicalizing(['E-3'], array_column($this->especes($admin, 'tva', $a, 2026, $tva)->json(), 'factNum'));

        // Chiffre d'affaire et autre année : leurs propres règlements seulement (un client n'est jamais cumulé avec un fournisseur).
        $this->assertSame(['E-8'], array_column($this->especes($admin, 'chiffre_affaire', $a)->json(), 'factNum'));
        $this->assertSame(['E-9'], array_column($this->especes($admin, 'tva', $a, 2025)->json(), 'factNum'));
        $this->especes($admin, 'tva', $this->entreprise('C'))->assertOk()->assertJsonCount(0);
    }

    public function test_especes_existantes_est_en_lecture_seule_avec_droits_et_validation(): void
    {
        $admin = $this->admin();
        $entreprise = $this->entreprise();
        $this->actingAs($admin)->postJson('/api/v1/declarations/tva', $this->payload($entreprise, [$this->ligne('E-1', '111', ['ttc' => 9000])]))->assertStatus(201);
        $avant = DeclarationTva::count();

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/v1/declarations/tva/especes-existantes', ['entreprise_id' => 1, 'annee' => 2026])->assertStatus(401);

        $employe = User::factory()->create(['is_admin' => false]);
        $this->especes($employe, 'tva', $entreprise)->assertStatus(403);
        $permission = Permission::where('module', 'declaration')->where('action', 'liste')->firstOrFail();
        UserPermission::create(['user_id' => $employe->id, 'permission_id' => $permission->id, 'granted_at' => now()]);
        $this->especes($employe, 'tva', $entreprise)->assertOk()->assertJsonCount(1);

        $this->actingAs($admin)->postJson('/api/v1/declarations/tva/especes-existantes', ['annee' => 2026])->assertStatus(422);
        $this->actingAs($admin)->postJson('/api/v1/declarations/tva/especes-existantes', ['entreprise_id' => $entreprise->party_id, 'annee' => 1999])->assertStatus(422);
        $this->actingAs($admin)->postJson('/api/v1/declarations/inconnu/especes-existantes', ['entreprise_id' => $entreprise->party_id, 'annee' => 2026])->assertStatus(404);

        $this->assertSame($avant, DeclarationTva::count());
    }

    public function test_droits_validation_et_lecture_seule(): void
    {
        $admin = $this->admin();
        $entreprise = $this->entreprise();
        $this->actingAs($admin)->postJson('/api/v1/declarations/tva', $this->payload($entreprise, [$this->ligne('F-1')]))->assertStatus(201);
        $avant = DeclarationTva::count();

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/v1/declarations/tva/factures-existantes', ['entreprise_id' => 1, 'numeros' => ['F-1']])->assertStatus(401);

        $employe = User::factory()->create(['is_admin' => false]);
        $this->verifier($employe, 'tva', $entreprise, ['F-1'])->assertStatus(403);
        $permission = Permission::where('module', 'declaration')->where('action', 'liste')->firstOrFail();
        UserPermission::create(['user_id' => $employe->id, 'permission_id' => $permission->id, 'granted_at' => now()]);
        $this->verifier($employe, 'tva', $entreprise, ['F-1'])->assertOk()->assertJsonCount(1);

        $this->actingAs($admin)->postJson('/api/v1/declarations/tva/factures-existantes', ['numeros' => ['F-1']])->assertStatus(422);
        $this->actingAs($admin)->postJson('/api/v1/declarations/inconnu/factures-existantes', ['entreprise_id' => $entreprise->party_id, 'numeros' => ['F-1']])->assertStatus(404);
        $this->verifier($admin, 'tva', $entreprise, ['', '  '])->assertOk()->assertJsonCount(0);

        $this->assertSame($avant, DeclarationTva::count());
    }
}
