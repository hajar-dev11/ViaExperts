<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Paiement;
use App\Models\Party;
use App\Models\User;
use App\Modules\Facturation\Models\DocumentCommercial;
use Database\Seeders\PermissionSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Couplage de PERSISTANCE entre Paiements et Facturation (`paiements.document_id` → `documents_commerciaux.id`).
 *
 * Tests de CARACTÉRISATION (étape 13, audit) : ils décrivent le comportement EXISTANT de la clé étrangère et de la
 * suppression douce, sans rien changer. Ils servent de filet si la clé étrangère ou les migrations sont un jour revues.
 * Ils sont dans `tests/Feature` (transverses) car ils portent sur deux modules à la fois.
 */
class PaiementFacturePersistenceTest extends TestCase
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

    private function party(): Party
    {
        $party = Party::create(['type' => 'client', 'status' => 'actif']);
        Client::create(['party_id' => $party->id, 'type' => 'client', 'genre' => 'M', 'nom' => 'CLIENT TEST']);

        return $party;
    }

    /** Facture de 2160.00 TTC avec un paiement de 500 rattaché : [admin, facture, id du paiement]. */
    private function factureAvecPaiement(): array
    {
        $admin = $this->admin();
        $party = $this->party();
        $factureId = $this->actingAs($admin)->postJson('/api/v1/facturation/facture', [
            'emetteur' => 'bureau_comptabilite', 'party_id' => $party->id, 'numero' => 'FAC-001/26',
            'date_document' => '2026-09-17 11:00:00', 'prix_paye' => 0,
            'lignes' => [['designation' => 'Service A', 'quantite' => 2, 'prix_unitaire' => 1000, 'remise_pourcent' => 10, 'tva_pourcent' => 20]],
        ])->json('data.id');
        $paiementId = $this->actingAs($admin)->postJson('/api/v1/paiements', [
            'emetteur' => 'bureau_comptabilite', 'party_id' => $party->id, 'document_id' => $factureId,
            'date_operation' => '2026-09-17 12:00:00', 'prix_paye' => 500,
            'lignes' => [['designation' => 'Service A', 'quantite' => 1, 'prix_unitaire' => 3000]],
        ])->assertStatus(201)->json('data.id');

        return [$admin, DocumentCommercial::find($factureId), $paiementId];
    }

    // ---- La clé étrangère elle-même -------------------------------------------------------------------------------

    public function test_la_cle_etrangere_existe_avec_set_null_a_la_suppression_et_cascade_a_la_mise_a_jour(): void
    {
        $fk = DB::selectOne(
            'select rc.DELETE_RULE as suppression, rc.UPDATE_RULE as maj, kcu.REFERENCED_TABLE_NAME as table_cible, kcu.REFERENCED_COLUMN_NAME as colonne_cible
             from information_schema.REFERENTIAL_CONSTRAINTS rc
             join information_schema.KEY_COLUMN_USAGE kcu
               on kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA and kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME and kcu.TABLE_NAME = rc.TABLE_NAME
             where rc.CONSTRAINT_SCHEMA = database() and rc.TABLE_NAME = ? and kcu.COLUMN_NAME = ?',
            ['paiements', 'document_id']
        );

        $this->assertNotNull($fk, 'FK paiements.document_id attendue.');
        $this->assertSame('documents_commerciaux', $fk->table_cible);
        $this->assertSame('id', $fk->colonne_cible);
        $this->assertSame('SET NULL', $fk->suppression);
        $this->assertSame('CASCADE', $fk->maj);

        $colonne = DB::selectOne('select IS_NULLABLE as nullable from information_schema.COLUMNS where TABLE_SCHEMA = database() and TABLE_NAME = ? and COLUMN_NAME = ?', ['paiements', 'document_id']);
        $this->assertSame('YES', $colonne->nullable, 'Le rattachement à une facture est facultatif.');
    }

    public function test_la_base_refuse_un_paiement_vers_un_document_inexistant(): void
    {
        $party = $this->party();

        $this->expectException(QueryException::class);
        $this->expectExceptionMessageMatches('/foreign key constraint fails|Integrity constraint violation/i');

        DB::table('paiements')->insert([
            'reference' => '#FK1', 'emetteur' => 'bureau_comptabilite', 'party_id' => $party->id, 'document_id' => 999999,
            'date_operation' => '2026-09-17 12:00:00', 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    // ---- Suppression douce du document (ce que fait « Supprimer définitivement » dans l'API) -------------------------

    public function test_la_suppression_definitive_d_un_document_est_une_suppression_douce_qui_conserve_la_ligne_et_le_lien(): void
    {
        [$admin, $facture, $paiementId] = $this->factureAvecPaiement();

        $this->actingAs($admin)->postJson("/api/v1/facturation/facture/{$facture->id}/corbeille")->assertOk();
        $this->actingAs($admin)->deleteJson("/api/v1/facturation/facture/{$facture->id}")->assertOk();

        $this->assertNull(DocumentCommercial::find($facture->id), 'Invisible via le modèle (portée suppression douce).');
        $this->assertNotNull(DocumentCommercial::withTrashed()->find($facture->id)->deleted_at, 'La ligne existe toujours en base.');
        $this->assertSame($facture->id, Paiement::find($paiementId)->document_id, 'Le lien n\'est pas remis à NULL (la FK ne se déclenche pas).');

        $this->actingAs($admin)->getJson("/api/v1/paiements/{$paiementId}")->assertOk()
            ->assertJsonPath('data.documentId', $facture->id)
            ->assertJsonPath('data.factureNumero', null);
    }

    public function test_un_paiement_modifie_apres_suppression_douce_du_document_ne_touche_pas_au_document(): void
    {
        [$admin, $facture, $paiementId] = $this->factureAvecPaiement();
        $this->actingAs($admin)->postJson("/api/v1/facturation/facture/{$facture->id}/corbeille");
        $this->actingAs($admin)->deleteJson("/api/v1/facturation/facture/{$facture->id}");

        // La resynchronisation ne trouve pas le document (portée suppression douce) : pas d'erreur, `prix_paye` figé.
        $this->actingAs($admin)->postJson("/api/v1/paiements/{$paiementId}", ['prix_paye' => 300])->assertOk();

        $this->assertSame('500.00', DocumentCommercial::withTrashed()->find($facture->id)->prix_paye);
        $this->assertSame('300.00', Paiement::find($paiementId)->prix_paye);
        // La validation accepte toujours ce document (cf. étape 10).
        $this->actingAs($admin)->postJson("/api/v1/paiements/{$paiementId}", ['document_id' => $facture->id])->assertOk();
    }

    public function test_la_restauration_de_la_ligne_supprimee_en_douceur_retablit_numero_et_synchronisation(): void
    {
        [$admin, $facture, $paiementId] = $this->factureAvecPaiement();
        $this->actingAs($admin)->postJson("/api/v1/facturation/facture/{$facture->id}/corbeille");
        $this->actingAs($admin)->deleteJson("/api/v1/facturation/facture/{$facture->id}");

        // Aucune route API ne restaure une ligne supprimée (404 : le modèle ne la voit plus) ; seule la base / le modèle le peut.
        $this->actingAs($admin)->postJson("/api/v1/facturation/facture/{$facture->id}/restore")->assertStatus(404);
        DocumentCommercial::withTrashed()->find($facture->id)->restore();

        $this->actingAs($admin)->getJson("/api/v1/paiements/{$paiementId}")->assertOk()->assertJsonPath('data.factureNumero', 'FAC-001/26');
        $this->actingAs($admin)->postJson("/api/v1/paiements/{$paiementId}", ['prix_paye' => 300])->assertOk();
        $this->assertSame('300.00', DocumentCommercial::find($facture->id)->prix_paye, 'Synchronisation rétablie.');
    }

    // ---- Statuts archive / corbeille (sans suppression douce) -------------------------------------------------------

    public function test_un_document_archive_ou_en_corbeille_de_statut_garde_ses_paiements_et_reste_synchronise(): void
    {
        [$admin, $facture, $paiementId] = $this->factureAvecPaiement();

        foreach (['archive', 'corbeille'] as $statut) {
            $this->actingAs($admin)->postJson("/api/v1/facturation/facture/{$facture->id}/{$statut}")->assertOk();

            $this->actingAs($admin)->getJson("/api/v1/paiements/{$paiementId}")->assertOk()
                ->assertJsonPath('data.documentId', $facture->id)
                ->assertJsonPath('data.factureNumero', 'FAC-001/26');
        }

        $this->actingAs($admin)->postJson("/api/v1/paiements/{$paiementId}", ['prix_paye' => 700])->assertOk();
        $this->assertSame('700.00', $facture->fresh()->prix_paye, 'Le statut ne bloque pas la synchronisation.');

        $this->actingAs($admin)->postJson("/api/v1/facturation/facture/{$facture->id}/restore")->assertOk();
        $this->assertSame($facture->id, Paiement::find($paiementId)->document_id);

        // Seules les factures « actif » sont proposées pour un nouveau rattachement.
        $this->actingAs($admin)->postJson("/api/v1/facturation/facture/{$facture->id}/archive");
        $this->actingAs($admin)->getJson('/api/v1/paiements/factures-disponibles')->assertOk()->assertJsonCount(0);
    }

    // ---- Suppression PHYSIQUE (hors API : SQL, purge de démonstration) -------------------------------------------

    public function test_la_suppression_physique_du_document_remet_document_id_a_null_et_conserve_le_paiement(): void
    {
        [$admin, $facture, $paiementId] = $this->factureAvecPaiement();

        DocumentCommercial::withTrashed()->find($facture->id)->forceDelete();

        $paiement = Paiement::find($paiementId);
        $this->assertNotNull($paiement, 'Le paiement est conservé.');
        $this->assertNull($paiement->document_id, 'ON DELETE SET NULL.');
        $this->assertSame('500.00', $paiement->prix_paye);
        $this->actingAs($admin)->getJson("/api/v1/paiements/{$paiementId}")->assertOk()
            ->assertJsonPath('data.documentId', null)
            ->assertJsonPath('data.factureNumero', null);
        $this->assertDatabaseCount('document_lignes', 0); // les lignes du document partent en cascade
    }
}
