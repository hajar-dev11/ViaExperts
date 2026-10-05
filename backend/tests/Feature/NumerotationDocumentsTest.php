<?php

namespace Tests\Feature;

use App\Models\CabinetSetting;
use App\Models\Client;
use App\Models\DocumentCommercial;
use App\Models\DomiciliationSetting;
use App\Models\Party;
use App\Models\User;
use App\Services\NumerotationDocuments;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use PDOException;
use Tests\TestCase;

/**
 * Service `NumerotationDocuments` : numéro proposé, avancement du compteur, rollback, et traitement d'une collision sur
 * l'index unique (type, numero). La concurrence entre PLUSIEURS PROCESSUS est testée dans NumerotationConcurrenceTest.
 */
class NumerotationDocumentsTest extends TestCase
{
    use RefreshDatabase;

    private function service(): NumerotationDocuments
    {
        return app(NumerotationDocuments::class);
    }

    private function party(): Party
    {
        $party = Party::create(['type' => 'client', 'status' => 'actif']);
        Client::create(['party_id' => $party->id, 'type' => 'client', 'genre' => 'Mr', 'nom' => 'CLIENT TEST']);

        return $party;
    }

    private function payload(Party $party, string $numero, array $override = []): array
    {
        return array_merge([
            'emetteur' => 'bureau_comptabilite',
            'party_id' => $party->id,
            'numero' => $numero,
            'date_document' => '2026-10-05 10:00:00',
            'lignes' => [['designation' => 'Service A', 'quantite' => 1, 'prix_unitaire' => 100]],
        ], $override);
    }

    private function bureau(array $valeurs): CabinetSetting
    {
        $reglages = CabinetSetting::firstOrCreate([]);
        $reglages->forceFill($valeurs)->save();

        return $reglages;
    }

    // ---- Numéro proposé -----------------------------------------------------------------------------------------

    public function test_le_numero_propose_suit_le_type_et_l_emetteur(): void
    {
        $this->bureau([
            'facture_prefixe' => 'F-', 'facture_prochain_numero' => 42, 'facture_suffixe' => '/26',
            'devis_prefixe' => 'D-', 'devis_prochain_numero' => 7, 'devis_suffixe' => null,
            'bl_prefixe' => null, 'bl_prochain_numero' => 9, 'bl_suffixe' => '-BL',
            'avoir_prefixe' => 'AV', 'avoir_prochain_numero' => 1, 'avoir_suffixe' => 'X',
        ]);
        DomiciliationSetting::firstOrCreate([])->forceFill(['facture_prefixe' => 'VE-', 'facture_prochain_numero' => 100, 'facture_suffixe' => '/V'])->save();

        $service = $this->service();

        // Bureau de comptabilité : un compteur indépendant par type.
        $this->assertSame('F-42/26', $service->proposer('bureau_comptabilite', 'facture')['numero']);
        $this->assertSame('D-7', $service->proposer('bureau_comptabilite', 'devis')['numero']);
        $this->assertSame('9-BL', $service->proposer('bureau_comptabilite', 'bl')['numero']);
        $this->assertSame('AV1X', $service->proposer('bureau_comptabilite', 'avoir')['numero']);

        // Via Experts : ses propres réglages.
        $this->assertSame('VE-100/V', $service->proposer('via_experts', 'facture')['numero']);
    }

    public function test_le_responsable_propose_vient_des_reglages_de_l_emetteur(): void
    {
        $service = $this->service();

        $this->assertNull($service->proposer('bureau_comptabilite', 'facture')['responsable']);
        $this->assertSame('Via Experts', $service->proposer('via_experts', 'facture')['responsable']);

        $this->bureau(['nom_societe' => 'Maitre : Morad Bendeq']);
        DomiciliationSetting::firstOrCreate([])->forceFill(['nom_societe' => 'Centre Test'])->save();

        $this->assertSame('Maitre : Morad Bendeq', $service->proposer('bureau_comptabilite', 'facture')['responsable']);
        $this->assertSame('Centre Test', $service->proposer('via_experts', 'facture')['responsable']);
    }

    // ---- Avancement du compteur ---------------------------------------------------------------------------------

    public function test_le_compteur_avance_de_un_quand_le_numero_est_celui_propose(): void
    {
        $reglages = $this->bureau(['facture_prefixe' => 'F-', 'facture_prochain_numero' => 42, 'facture_suffixe' => '/26', 'devis_prochain_numero' => 5]);

        $this->service()->avancer('bureau_comptabilite', 'facture', 'F-42/26');

        $reglages->refresh();
        $this->assertSame(43, (int) $reglages->facture_prochain_numero);
        $this->assertSame('F-', $reglages->facture_prefixe, 'Le préfixe ne change jamais.');
        $this->assertSame('/26', $reglages->facture_suffixe, 'Le suffixe ne change jamais.');
        $this->assertSame(5, (int) $reglages->devis_prochain_numero, 'Les autres types ne bougent pas.');
        $this->assertSame('F-43/26', $this->service()->proposer('bureau_comptabilite', 'facture')['numero']);
    }

    public function test_un_numero_saisi_a_la_main_ne_deplace_pas_le_compteur(): void
    {
        $reglages = $this->bureau(['facture_prefixe' => 'F-', 'facture_prochain_numero' => 42, 'facture_suffixe' => '/26']);

        $this->service()->avancer('bureau_comptabilite', 'facture', 'MANUEL-1');
        $this->service()->avancer('bureau_comptabilite', 'facture', 'F-41/26');

        $this->assertSame(42, (int) $reglages->fresh()->facture_prochain_numero);
    }

    public function test_un_compteur_vide_n_est_pas_incremente(): void
    {
        $reglages = $this->bureau(['facture_prefixe' => 'F-', 'facture_prochain_numero' => null, 'facture_suffixe' => null]);

        $this->service()->avancer('bureau_comptabilite', 'facture', 'F-');

        $this->assertNull($reglages->fresh()->facture_prochain_numero);
    }

    public function test_le_compteur_de_via_experts_et_celui_du_bureau_sont_independants(): void
    {
        $bureau = $this->bureau(['facture_prochain_numero' => 10]);
        $via = DomiciliationSetting::firstOrCreate([]);
        $via->forceFill(['facture_prochain_numero' => 10])->save();

        $this->service()->avancer('via_experts', 'facture', '10');

        $this->assertSame(11, (int) $via->fresh()->facture_prochain_numero);
        $this->assertSame(10, (int) $bureau->fresh()->facture_prochain_numero);
    }

    // ---- Rollback -----------------------------------------------------------------------------------------------

    public function test_le_compteur_et_le_document_sont_annules_ensemble_en_cas_d_echec(): void
    {
        $reglages = $this->bureau(['facture_prefixe' => 'F-', 'facture_prochain_numero' => 42, 'facture_suffixe' => '/26']);
        $party = $this->party();

        try {
            DB::transaction(function () use ($party) {
                DocumentCommercial::create([
                    'type' => 'facture', 'emetteur' => 'bureau_comptabilite', 'party_id' => $party->id,
                    'numero' => 'F-42/26', 'date_document' => '2026-10-05 10:00:00',
                ]);
                $this->service()->avancer('bureau_comptabilite', 'facture', 'F-42/26');
                $this->assertSame(43, (int) CabinetSetting::first()->facture_prochain_numero);

                throw new \RuntimeException('échec simulé après l\'avancement du compteur');
            });
            $this->fail('L\'exception aurait dû traverser la transaction.');
        } catch (\RuntimeException) {
            // attendu
        }

        $this->assertSame(42, (int) $reglages->fresh()->facture_prochain_numero, 'Le compteur doit revenir à sa valeur initiale.');
        $this->assertSame(0, DocumentCommercial::where('numero', 'F-42/26')->count(), 'Le document doit être annulé aussi.');
    }

    // ---- Collision sur l'index unique ---------------------------------------------------------------------------

    public function test_une_collision_detectee_en_base_donne_un_422_et_aucun_doublon_ni_compteur_perdu(): void
    {
        $reglages = $this->bureau(['facture_prefixe' => 'F-', 'facture_prochain_numero' => 42, 'facture_suffixe' => '/26']);
        $party = $this->party();
        $admin = User::factory()->create(['is_admin' => true]);

        // Simule une création concurrente validée entre la vérification d'unicité et l'écriture : juste avant l'INSERT
        // du document, une autre transaction a déjà pris ce numéro (l'index unique le refusera).
        DocumentCommercial::creating(function (DocumentCommercial $document) {
            DB::table('documents_commerciaux')->insert([
                'type' => $document->type, 'emetteur' => $document->emetteur, 'party_id' => $document->party_id,
                'numero' => $document->numero, 'date_document' => '2026-10-05 09:00:00',
                'created_at' => now(), 'updated_at' => now(),
            ]);
        });

        $reponse = $this->actingAs($admin)->postJson('/api/v1/facturation/facture', $this->payload($party, 'F-42/26'));

        $reponse->assertStatus(422)
            ->assertJsonValidationErrors(['numero'])
            ->assertJsonPath('errors.numero.0', NumerotationDocuments::MESSAGE_NUMERO_PRIS)
            ->assertJsonPath('message', NumerotationDocuments::MESSAGE_NUMERO_PRIS);

        $this->assertSame(0, DocumentCommercial::where('numero', 'F-42/26')->count(), 'Aucun document (ni doublon) ne doit rester.');
        $this->assertSame(42, (int) $reglages->fresh()->facture_prochain_numero, 'Le compteur ne doit pas avancer.');
    }

    public function test_la_reponse_de_collision_est_identique_a_celle_de_la_validation_d_unicite(): void
    {
        $this->bureau(['facture_prefixe' => 'F-', 'facture_prochain_numero' => 42, 'facture_suffixe' => '/26']);
        $party = $this->party();
        $admin = User::factory()->create(['is_admin' => true]);

        $this->actingAs($admin)->postJson('/api/v1/facturation/facture', $this->payload($party, 'F-42/26'))->assertStatus(201);

        // Cas « normal » : le numéro existe déjà au moment de la validation.
        $normal = $this->actingAs($admin)->postJson('/api/v1/facturation/facture', $this->payload($party, 'F-42/26'));
        $normal->assertStatus(422);

        $this->assertSame(NumerotationDocuments::MESSAGE_NUMERO_PRIS, $normal->json('errors.numero.0'));
        $this->assertSame(['message', 'errors'], array_keys($normal->json()));
    }

    public function test_une_collision_lors_d_une_modification_donne_aussi_un_422(): void
    {
        $party = $this->party();
        $admin = User::factory()->create(['is_admin' => true]);
        $id = $this->actingAs($admin)->postJson('/api/v1/facturation/facture', $this->payload($party, 'A-1'))->json('data.id');

        DocumentCommercial::updating(function (DocumentCommercial $document) {
            if ($document->isDirty('numero')) {
                DB::table('documents_commerciaux')->insert([
                    'type' => $document->type, 'emetteur' => $document->emetteur, 'party_id' => $document->party_id,
                    'numero' => $document->numero, 'date_document' => '2026-10-05 09:00:00',
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        });

        $this->actingAs($admin)->putJson("/api/v1/facturation/facture/{$id}", ['numero' => 'A-2'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['numero']);

        $this->assertSame('A-1', DocumentCommercial::find($id)->numero, 'Le document garde son numéro d\'origine.');
    }

    // ---- Reconnaissance des erreurs SQL -------------------------------------------------------------------------

    private function erreurSql(int $codeMysql, string $message): QueryException
    {
        $pdo = new PDOException($message, 23000);
        $pdo->errorInfo = ['23000', $codeMysql, $message];

        return new QueryException('insert into documents_commerciaux ...', [], $pdo);
    }

    public function test_seule_la_collision_sur_l_index_unique_des_numeros_est_convertie(): void
    {
        $service = $this->service();

        $collision = $this->erreurSql(1062, "Duplicate entry 'facture-F-1' for key 'documents_commerciaux_type_numero_unique'");
        $this->assertTrue($service->estCollisionNumero($collision));
        $this->expectException(ValidationException::class);
        $service->convertirCollision($collision);
    }

    public function test_les_autres_erreurs_sql_ne_sont_pas_converties(): void
    {
        $service = $this->service();

        $autreIndex = $this->erreurSql(1062, "Duplicate entry 'x' for key 'users_email_unique'");
        $autreErreur = $this->erreurSql(1452, 'Cannot add or update a child row: a foreign key constraint fails');

        foreach ([$autreIndex, $autreErreur] as $erreur) {
            $this->assertFalse($service->estCollisionNumero($erreur));
            $service->convertirCollision($erreur); // ne lance rien : l'appelant relance l'erreur d'origine
        }
        $this->addToAssertionCount(1);
    }
}
