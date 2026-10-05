<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Modules\Facturation\Models\DocumentCommercial;
use App\Models\Paiement;
use App\Models\Party;
use App\Models\Permission;
use App\Models\Service;
use App\Models\User;
use App\Models\UserPermission;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PaiementTest extends TestCase
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

    /** Facture de 2160.00 TTC (2 × 1000, remise 10 %, TVA 20 %). */
    private function facture(User $admin, Party $party): DocumentCommercial
    {
        $id = $this->actingAs($admin)->postJson('/api/v1/facturation/facture', [
            'emetteur' => 'bureau_comptabilite',
            'party_id' => $party->id,
            'numero' => 'FAC-001/26',
            'date_document' => '2026-09-17 11:00:00',
            'prix_paye' => 0,
            'lignes' => [['designation' => 'Service A', 'quantite' => 2, 'prix_unitaire' => 1000, 'remise_pourcent' => 10, 'tva_pourcent' => 20]],
        ])->json('data.id');

        return DocumentCommercial::find($id);
    }

    private function payload(Party $party, array $override = []): array
    {
        return array_merge([
            'emetteur' => 'bureau_comptabilite',
            'responsable' => 'Maitre : Morad Bendeq',
            'party_id' => $party->id,
            'date_operation' => '2026-09-17 12:00:00',
            'mode_paiement' => 'Espèce',
            'prix_paye' => 500,
            'lignes' => [['designation' => 'Service A', 'quantite' => 1, 'prix_unitaire' => 3000]],
        ], $override);
    }

    public function test_guest_is_rejected(): void
    {
        $this->getJson('/api/v1/paiements')->assertStatus(401);
    }

    public function test_admin_can_create_payment_with_reference_and_totals(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)
            ->postJson('/api/v1/paiements', $this->payload($this->party()))
            ->assertStatus(201)
            ->assertJsonPath('data.total', '3000.00')
            ->assertJsonPath('data.prixPaye', '500.00')
            ->assertJsonPath('data.prixRestant', '2500.00')
            ->assertJsonPath('data.client', 'CLIENT TEST')
            ->assertJsonPath('data.reference', '#1');

        $this->assertDatabaseCount('paiements', 1);
        $this->assertDatabaseCount('paiement_lignes', 1);
    }

    public function test_payment_requires_a_line(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/v1/paiements', $this->payload($this->party(), ['lignes' => []]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['lignes']);
    }

    // ---- Option C : la facture est resynchronisée sur la somme des paiements ----

    public function test_payment_updates_invoice_prix_paye(): void
    {
        $admin = $this->admin();
        $party = $this->party();
        $facture = $this->facture($admin, $party);

        $this->assertSame('0.00', $facture->prix_paye);

        $this->actingAs($admin)->postJson('/api/v1/paiements', $this->payload($party, [
            'document_id' => $facture->id, 'prix_paye' => 500,
        ]))->assertStatus(201);

        $this->assertSame('500.00', $facture->fresh()->prix_paye);
        $this->assertSame('1660.00', $facture->fresh()->prix_restant);
    }

    public function test_several_payments_are_summed_on_the_invoice(): void
    {
        $admin = $this->admin();
        $party = $this->party();
        $facture = $this->facture($admin, $party);

        $this->actingAs($admin)->postJson('/api/v1/paiements', $this->payload($party, ['document_id' => $facture->id, 'prix_paye' => 500]));
        $this->actingAs($admin)->postJson('/api/v1/paiements', $this->payload($party, ['document_id' => $facture->id, 'prix_paye' => 660]));

        $this->assertSame('1160.00', $facture->fresh()->prix_paye);
        $this->assertSame('1000.00', $facture->fresh()->prix_restant);
    }

    public function test_updating_a_payment_resyncs_the_invoice(): void
    {
        $admin = $this->admin();
        $party = $this->party();
        $facture = $this->facture($admin, $party);

        $id = $this->actingAs($admin)->postJson('/api/v1/paiements', $this->payload($party, [
            'document_id' => $facture->id, 'prix_paye' => 500,
        ]))->json('data.id');

        $this->actingAs($admin)->postJson("/api/v1/paiements/{$id}", ['prix_paye' => 2160])->assertOk();

        $this->assertSame('2160.00', $facture->fresh()->prix_paye);
        $this->assertSame('0.00', $facture->fresh()->prix_restant);
    }

    public function test_archiving_a_payment_removes_it_from_the_invoice_total(): void
    {
        $admin = $this->admin();
        $party = $this->party();
        $facture = $this->facture($admin, $party);

        $id = $this->actingAs($admin)->postJson('/api/v1/paiements', $this->payload($party, [
            'document_id' => $facture->id, 'prix_paye' => 500,
        ]))->json('data.id');

        $this->assertSame('500.00', $facture->fresh()->prix_paye);

        $this->actingAs($admin)->postJson("/api/v1/paiements/{$id}/archive")->assertOk();
        $this->assertSame('0.00', $facture->fresh()->prix_paye);

        $this->actingAs($admin)->postJson("/api/v1/paiements/{$id}/restore")->assertOk();
        $this->assertSame('500.00', $facture->fresh()->prix_paye);
    }

    public function test_deleting_a_payment_resyncs_the_invoice(): void
    {
        $admin = $this->admin();
        $party = $this->party();
        $facture = $this->facture($admin, $party);

        $id = $this->actingAs($admin)->postJson('/api/v1/paiements', $this->payload($party, [
            'document_id' => $facture->id, 'prix_paye' => 500,
        ]))->json('data.id');

        $this->actingAs($admin)->postJson("/api/v1/paiements/{$id}/corbeille")->assertOk();
        $this->actingAs($admin)->deleteJson("/api/v1/paiements/{$id}")->assertOk();

        $this->assertSame('0.00', $facture->fresh()->prix_paye);
        $this->assertNull(Paiement::find($id));
    }

    public function test_attachment_is_really_stored(): void
    {
        Storage::fake('public');

        $this->actingAs($this->admin())
            ->postJson('/api/v1/paiements', $this->payload($this->party(), [
                'piece_jointe' => UploadedFile::fake()->create('recu.pdf', 10, 'application/pdf'),
            ]))
            ->assertStatus(201)
            ->assertJsonPath('data.pieceJointeNom', 'recu.pdf');

        Storage::disk('public')->assertExists(Paiement::first()->piece_jointe_chemin);
    }

    public function test_gestion_view_returns_one_row_per_service_line(): void
    {
        $admin = $this->admin();
        $party = $this->party();
        $serviceA = Service::create(['nom' => 'Service A', 'prix' => 2000, 'status' => 'actif']);

        $this->actingAs($admin)->postJson('/api/v1/paiements', $this->payload($party, [
            'prix_paye' => 3000,
            'lignes' => [
                // La désignation peut diverger du nom du service (texte modifiable) :
                // « Service A — acompte » n'est volontairement pas « Service A ».
                ['service_id' => $serviceA->id, 'designation' => 'Service A — acompte', 'quantite' => 1, 'prix_unitaire' => 2000],
                ['designation' => 'Service B', 'quantite' => 1, 'prix_unitaire' => 1000],
            ],
        ]));

        $this->actingAs($admin)->getJson('/api/v1/paiements/gestion')
            ->assertOk()
            ->assertJsonCount(2)
            ->assertJsonPath('0.regle', true);

        // Filtre « Non réglé » : rien, puisque le paiement est soldé.
        $this->actingAs($admin)->getJson('/api/v1/paiements/gestion?regle=false')
            ->assertOk()
            ->assertJsonCount(0);
    }

    // La colonne « Service » de « Gestion des Paiements » doit montrer le vrai nom
    // du catalogue (relation `service_id`), jamais la désignation libre de la ligne
    // — et jamais un nom inventé quand la ligne n'a pas de service réel (service_id
    // absent, ou pointant vers un service depuis supprimé).
    public function test_gestion_view_shows_the_real_service_name_not_the_free_text_designation(): void
    {
        $admin = $this->admin();
        $party = $this->party();
        $service = Service::create(['nom' => 'Déclaration TVA', 'prix' => 450, 'status' => 'actif']);

        $this->actingAs($admin)->postJson('/api/v1/paiements', $this->payload($party, [
            'lignes' => [
                ['service_id' => $service->id, 'designation' => 'Règlement TVA T2', 'quantite' => 1, 'prix_unitaire' => 450],
            ],
        ]));

        $this->actingAs($admin)->getJson('/api/v1/paiements/gestion')
            ->assertOk()
            ->assertJsonPath('0.service', 'Déclaration TVA');
    }

    public function test_gestion_view_returns_null_service_when_line_has_no_real_service(): void
    {
        $admin = $this->admin();
        $party = $this->party();

        $this->actingAs($admin)->postJson('/api/v1/paiements', $this->payload($party, [
            'lignes' => [
                ['designation' => 'Règlement de démonstration', 'quantite' => 1, 'prix_unitaire' => 500],
            ],
        ]));

        $this->actingAs($admin)->getJson('/api/v1/paiements/gestion')
            ->assertOk()
            ->assertJsonPath('0.service', null);
    }

    public function test_gestion_view_returns_null_service_when_linked_service_was_deleted(): void
    {
        $admin = $this->admin();
        $party = $this->party();
        $service = Service::create(['nom' => '[Démo] Service supprimé', 'prix' => 100, 'status' => 'actif']);

        $this->actingAs($admin)->postJson('/api/v1/paiements', $this->payload($party, [
            'lignes' => [
                ['service_id' => $service->id, 'designation' => 'Règlement de démonstration', 'quantite' => 1, 'prix_unitaire' => 100],
            ],
        ]));
        $service->delete(); // soft delete — le service n'existe plus « réellement ».

        $this->actingAs($admin)->getJson('/api/v1/paiements/gestion')
            ->assertOk()
            ->assertJsonPath('0.service', null);
    }

    public function test_le_numero_de_facture_est_expose_via_le_contrat_de_facturation(): void
    {
        $admin = $this->admin();
        $party = $this->party();
        $facture = $this->facture($admin, $party);

        $id = $this->actingAs($admin)->postJson('/api/v1/paiements', $this->payload($party, ['document_id' => $facture->id]))
            ->assertStatus(201)
            ->assertJsonPath('data.documentId', $facture->id)
            ->assertJsonPath('data.factureNumero', 'FAC-001/26')
            ->json('data.id');
        $sansFacture = $this->actingAs($admin)->postJson('/api/v1/paiements', $this->payload($party))
            ->assertStatus(201)
            ->assertJsonPath('data.factureNumero', null)
            ->json('data.id');

        $this->actingAs($admin)->getJson("/api/v1/paiements/{$id}")->assertOk()->assertJsonPath('data.factureNumero', 'FAC-001/26');

        $liste = $this->actingAs($admin)->getJson('/api/v1/paiements')->assertOk()->json('data');
        $numeros = collect($liste)->pluck('factureNumero', 'id')->all();
        $this->assertSame('FAC-001/26', $numeros[$id]);
        $this->assertNull($numeros[$sansFacture]);
    }

    public function test_la_liste_des_paiements_resout_les_numeros_de_facture_en_une_seule_requete(): void
    {
        $admin = $this->admin();
        $party = $this->party();
        $facture = $this->facture($admin, $party);
        foreach ([1, 2, 3] as $i) {
            $this->actingAs($admin)->postJson('/api/v1/paiements', $this->payload($party, ['document_id' => $facture->id, 'prix_paye' => 100]))->assertStatus(201);
        }

        \DB::flushQueryLog();
        \DB::enableQueryLog();
        $this->actingAs($admin)->getJson('/api/v1/paiements')->assertOk();
        $requetesDocuments = collect(\DB::getQueryLog())->filter(fn ($q) => str_contains($q['query'], 'documents_commerciaux'))->count();
        \DB::disableQueryLog();

        $this->assertSame(1, $requetesDocuments, 'Une requête pour tout le lot, pas une par paiement.');
    }

    public function test_le_numero_de_facture_est_nul_si_la_facture_est_en_corbeille(): void
    {
        $admin = $this->admin();
        $party = $this->party();
        $facture = $this->facture($admin, $party);
        $id = $this->actingAs($admin)->postJson('/api/v1/paiements', $this->payload($party, ['document_id' => $facture->id]))->json('data.id');

        $facture->delete(); // suppression douce : comme l'ancienne relation, le numéro n'est plus résolu

        $this->actingAs($admin)->getJson("/api/v1/paiements/{$id}")->assertOk()
            ->assertJsonPath('data.documentId', $facture->id)
            ->assertJsonPath('data.factureNumero', null);
    }

    /** Faux « Services en cours » : enregistre chaque appel et l'état de la transaction / de la facture à cet instant. */
    private function espionServicesEnCours(?\Closure $surAppel = null): object
    {
        $espion = new class($surAppel) implements \App\Contracts\ServicesEnCours\AssureServicesEnCours {
            public array $appels = [];

            public function __construct(private ?\Closure $surAppel)
            {
            }

            public function assurerPourTiers(?int $partyId, iterable $serviceIds, int $creePar): void
            {
                $this->appels[] = [
                    'partyId' => $partyId,
                    'serviceIds' => collect($serviceIds)->all(),
                    'creePar' => $creePar,
                    'niveauTransaction' => \Illuminate\Support\Facades\DB::transactionLevel(),
                    'prixPayeFacture' => \Illuminate\Support\Facades\DB::table('documents_commerciaux')->value('prix_paye'),
                ];

                if ($this->surAppel) {
                    ($this->surAppel)();
                }
            }
        };
        $this->app->instance(\App\Contracts\ServicesEnCours\AssureServicesEnCours::class, $espion);

        return $espion;
    }

    public function test_paiements_passe_par_le_contrat_services_en_cours_a_la_creation_et_a_la_modification(): void
    {
        $admin = $this->admin();
        $party = $this->party();
        $a = Service::create(['nom' => 'Service A', 'prix' => 100, 'status' => 'actif']);
        $b = Service::create(['nom' => 'Service B', 'prix' => 100, 'status' => 'actif']);
        $facture = $this->facture($admin, $party);
        $espion = $this->espionServicesEnCours();
        $niveauHorsTransaction = \DB::transactionLevel();

        $id = $this->actingAs($admin)->postJson('/api/v1/paiements', $this->payload($party, [
            'document_id' => $facture->id,
            'lignes' => [
                ['service_id' => $a->id, 'designation' => 'A', 'quantite' => 1, 'prix_unitaire' => 100],
                ['service_id' => null, 'designation' => 'Libre', 'quantite' => 1, 'prix_unitaire' => 50],
            ],
        ]))->assertStatus(201)->json('data.id');

        $this->assertCount(1, $espion->appels, 'Un appel synchrone à la création.');
        $this->assertSame($party->id, $espion->appels[0]['partyId']);
        $this->assertSame([$a->id, null], $espion->appels[0]['serviceIds'], 'Même données : service_id des lignes, dans l\'ordre.');
        $this->assertSame($admin->id, $espion->appels[0]['creePar']);
        $this->assertGreaterThan($niveauHorsTransaction, $espion->appels[0]['niveauTransaction'], 'Appelé DANS la transaction.');
        $this->assertSame('0.00', $espion->appels[0]['prixPayeFacture'], 'Appelé AVANT la resynchronisation de la facture (même ordre qu\'avant).');
        $this->assertSame('500.00', $facture->fresh()->prix_paye, 'La resynchronisation a bien eu lieu ensuite.');

        $this->actingAs($admin)->postJson("/api/v1/paiements/{$id}", [
            'lignes' => [
                ['service_id' => $a->id, 'designation' => 'A', 'quantite' => 1, 'prix_unitaire' => 100],
                ['service_id' => $b->id, 'designation' => 'B', 'quantite' => 1, 'prix_unitaire' => 100],
            ],
        ])->assertOk();

        $this->assertCount(2, $espion->appels, 'Un appel à la modification.');
        $this->assertSame([$a->id, $b->id], $espion->appels[1]['serviceIds']);
        $this->assertSame($party->id, $espion->appels[1]['partyId']);
        $this->assertGreaterThan($niveauHorsTransaction, $espion->appels[1]['niveauTransaction']);
    }

    public function test_paiements_ne_cree_pas_les_services_en_cours_lui_meme(): void
    {
        $admin = $this->admin();
        $party = $this->party();
        $service = Service::create(['nom' => 'Service A', 'prix' => 100, 'status' => 'actif']);
        $this->espionServicesEnCours(); // le faux contrat n'écrit rien

        $this->actingAs($admin)->postJson('/api/v1/paiements', $this->payload($party, [
            'lignes' => [['service_id' => $service->id, 'designation' => 'A', 'quantite' => 1, 'prix_unitaire' => 100]],
        ]))->assertStatus(201);

        $this->assertDatabaseCount('service_en_cours', 0);
    }

    public function test_une_erreur_de_services_en_cours_est_propagee_et_annule_le_paiement(): void
    {
        $admin = $this->admin();
        $party = $this->party();
        $facture = $this->facture($admin, $party);
        $this->espionServicesEnCours(fn () => throw new \RuntimeException('Services en cours indisponible'));
        $this->withoutExceptionHandling();

        try {
            $this->actingAs($admin)->postJson('/api/v1/paiements', $this->payload($party, ['document_id' => $facture->id]));
            $this->fail('L\'exception du contrat doit remonter jusqu\'à l\'appelant.');
        } catch (\RuntimeException $e) {
            $this->assertSame('Services en cours indisponible', $e->getMessage());
        }

        $this->assertSame(0, Paiement::count(), 'La transaction est annulée : aucun paiement.');
        $this->assertSame('0.00', $facture->fresh()->prix_paye, 'La facture n\'a pas été touchée.');
    }

    public function test_le_code_de_production_de_paiements_n_appelle_plus_service_en_cours_directement(): void
    {
        foreach (['app/Http/Controllers/Api/V1/PaiementController.php', 'app/Models/Paiement.php', 'app/Http/Resources/PaiementResource.php'] as $fichier) {
            $source = file_get_contents(base_path($fichier));

            $this->assertStringNotContainsString('ServiceEnCours::', $source, "{$fichier} ne doit pas appeler le modèle ServiceEnCours.");
            $this->assertStringNotContainsString('App\Models\ServiceEnCours', $source, "{$fichier} ne doit pas importer le modèle ServiceEnCours.");
            $this->assertStringNotContainsString('AssureServicesEnCoursEloquent', $source, "{$fichier} ne doit pas connaître l'implémentation concrète.");
        }

        $this->assertStringContainsString(
            'AssureServicesEnCours',
            file_get_contents(base_path('app/Http/Controllers/Api/V1/PaiementController.php'))
        );
    }
    public function test_staff_permissions_are_enforced(): void
    {
        $staff = User::factory()->create(['is_admin' => false]);

        $this->actingAs($staff)->getJson('/api/v1/paiements')->assertStatus(403);
        $this->actingAs($staff)->getJson('/api/v1/paiements/gestion')->assertStatus(403);

        $permission = Permission::where('module', 'paiements')->where('action', 'list_paiements')->firstOrFail();
        UserPermission::create(['user_id' => $staff->id, 'permission_id' => $permission->id, 'granted_at' => now()]);

        $this->actingAs($staff)->getJson('/api/v1/paiements')->assertOk();
        // `gestion_paiements` reste absente : toujours 403.
        $this->actingAs($staff)->getJson('/api/v1/paiements/gestion')->assertStatus(403);
    }
}
