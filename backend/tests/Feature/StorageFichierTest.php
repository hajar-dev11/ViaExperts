<?php

namespace Tests\Feature;

use App\Http\Controllers\StorageFichierController;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * `/storage/{chemin}` : fichiers téléversés servis par l'application, sous session ouverte, pour les hébergements sans lien
 * symbolique (LWS). Le disque `public` est simulé : aucun vrai fichier n'est lu ni écrit.
 */
class StorageFichierTest extends TestCase
{
    use RefreshDatabase;

    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    private function utilisateur(): User
    {
        return User::factory()->create(['is_admin' => false]);
    }

    public function test_sans_session_un_fichier_existant_est_refuse_en_401(): void
    {
        Storage::disk('public')->put('paiements/facture.pdf', '%PDF-1.4 confidentiel');

        $this->get('/storage/paiements/facture.pdf')->assertStatus(401);
        $this->getJson('/storage/paiements/facture.pdf')->assertStatus(401);
    }

    public function test_connecte_une_photo_est_servie_et_affichable(): void
    {
        Storage::disk('public')->put('profiles/moi.png', base64_decode(self::PNG));

        $reponse = $this->actingAs($this->utilisateur())->get('/storage/profiles/moi.png');

        $reponse->assertOk();
        $this->assertSame('image/png', $reponse->headers->get('Content-Type'));
        $this->assertStringContainsString('inline', $reponse->headers->get('Content-Disposition'));
        $this->assertSame('nosniff', $reponse->headers->get('X-Content-Type-Options'));
        $this->assertStringContainsString('private', $reponse->headers->get('Cache-Control'));
    }

    public function test_connecte_un_pdf_est_affiche_sans_politique_sandbox(): void
    {
        Storage::disk('public')->put('entreprises/contrat.pdf', "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");

        $reponse = $this->actingAs($this->utilisateur())->get('/storage/entreprises/contrat.pdf');

        $reponse->assertOk();
        $this->assertSame('application/pdf', $reponse->headers->get('Content-Type'));
        $this->assertStringContainsString('inline', $reponse->headers->get('Content-Disposition'));
        $this->assertNull($reponse->headers->get('Content-Security-Policy'));
    }

    public function test_un_type_actif_est_telecharge_jamais_affiche(): void
    {
        Storage::disk('public')->put('fichiers/page.html', '<html><script>alert(1)</script></html>');
        Storage::disk('public')->put('fichiers/image.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

        foreach (['fichiers/page.html', 'fichiers/image.svg'] as $chemin) {
            $reponse = $this->actingAs($this->utilisateur())->get("/storage/{$chemin}");

            $reponse->assertOk();
            $this->assertSame('application/octet-stream', $reponse->headers->get('Content-Type'), $chemin);
            $this->assertStringContainsString('attachment', $reponse->headers->get('Content-Disposition'), $chemin);
            $this->assertStringContainsString('sandbox', $reponse->headers->get('Content-Security-Policy'), $chemin);
        }
    }

    public function test_un_fichier_inexistant_donne_404(): void
    {
        $this->actingAs($this->utilisateur())->get('/storage/profiles/absent.png')->assertStatus(404);
    }

    /** @return array<string, array{0: string}> */
    public static function cheminsDangereux(): array
    {
        return [
            'remontée de dossier' => ['../.env'],
            'remontée au milieu' => ['profiles/../../.env'],
            'remontée encodée' => ['profiles/%2e%2e/%2e%2e/.env'],
            'fichier caché' => ['.htaccess'],
            'segment caché' => ['profiles/.gitignore'],
            'caractère spécial' => ['profiles/a;b.png'],
        ];
    }

    #[DataProvider('cheminsDangereux')]
    public function test_un_chemin_dangereux_est_refuse_en_404(string $chemin): void
    {
        Storage::disk('public')->put('profiles/moi.png', base64_decode(self::PNG));
        Storage::disk('public')->put('.gitignore', '*');

        $this->actingAs($this->utilisateur())->get('/storage/'.$chemin)->assertStatus(404);
    }

    public function test_validation_du_chemin(): void
    {
        foreach (['profiles/a1b2c3.png', 'entreprises/observations/x_y-z.pdf', 'settings/cabinet/logo.jpeg', 'rapports/Rapport 2026.pdf'] as $ok) {
            $this->assertTrue(StorageFichierController::cheminValide($ok), $ok);
        }
        foreach (['', '..', 'a/../b', '/etc/passwd', 'a//b', 'a/', '.env', 'a/.env', 'profiles\\..\\.env', str_repeat('a', 401)] as $ko) {
            $this->assertFalse(StorageFichierController::cheminValide($ko), $ko);
        }
    }

    public function test_les_chemins_du_projet_sont_tous_acceptes(): void
    {
        // Dossiers réellement écrits par les contrôleurs (store(..., 'public')) : un nom aléatoire de Laravel doit passer.
        foreach (['cachets', 'chat', 'domiciliations', 'domiciliations/operations', 'domiciliations/observations', 'entreprises',
            'entreprises/observations', 'fichiers', 'mails', 'paiements', 'profiles', 'rapports', 'services-en-cours', 'settings/cabinet', 'settings/domiciliation'] as $dossier) {
            $this->assertTrue(StorageFichierController::cheminValide($dossier.'/'.str_replace('/', '_', 'Qm9u0AJQ8vDktZD6tnInMSjzSA2xJ71wdAXWY9eEXzk').'.jpg'), $dossier);
        }
    }

    public function test_une_photo_envoyee_est_relue_par_le_chemin_enregistre_en_base(): void
    {
        $moi = $this->utilisateur();
        $autre = $this->utilisateur();

        // 1. envoi
        $envoi = $this->actingAs($moi)->postJson('/api/v1/profile/photo', [
            'file' => UploadedFile::fake()->createWithContent('moi.png', base64_decode(self::PNG)),
        ])->assertOk();

        // 2. stockage et enregistrement du chemin, tel quel, en base
        $chemin = $envoi->json('user.photo_path');
        $this->assertMatchesRegularExpression('#^profiles/[A-Za-z0-9]+\.png$#', $chemin);
        Storage::disk('public')->assertExists($chemin);
        $this->assertSame($chemin, $moi->fresh()->photo_path);

        // 3. le frontend construit `<API>/storage/<photo_path>` : un utilisateur connecté (même un autre) la reçoit
        $this->actingAs($autre)->get('/storage/'.$chemin)->assertOk()->assertHeader('Content-Type', 'image/png');

        // 4. photo supprimée : le fichier n'est plus servi
        $this->actingAs($moi)->deleteJson('/api/v1/profile/photo')->assertOk();
        $this->actingAs($autre)->get('/storage/'.$chemin)->assertStatus(404);
    }

    public function test_les_routes_existantes_sont_conservees_avec_la_nouvelle_route(): void
    {
        $routes = collect(app('router')->getRoutes()->getRoutes())->map(fn ($r) => implode('|', $r->methods()).' '.$r->uri())->all();

        foreach (['GET|HEAD /', 'GET|HEAD storage/{chemin}', 'PUT api/v1/profile', 'POST api/v1/profile/photo', 'DELETE api/v1/profile/photo', 'POST api/v1/auth/login'] as $attendue) {
            $this->assertContains($attendue, $routes, $attendue);
        }

        $this->getJson('/')->assertOk()->assertExactJson(['status' => 'ok']);
    }}
