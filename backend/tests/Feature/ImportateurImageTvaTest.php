<?php

namespace Tests\Feature;

use App\Models\DeclarationTva;
use App\Models\DeclarationTvaLigne;
use App\Models\Permission;
use App\Models\User;
use App\Models\UserPermission;
use App\Support\ImageDeclarationTva;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * « Importateur de Déclaration » : réception de la PHOTO d'une déclaration TVA. Le serveur contrôle l'image ; il n'existe pas
 * de lecture automatique du contenu : rien n'est extrait, aucune déclaration ni ligne n'est créée, l'image n'est pas conservée.
 * Base de test uniquement (RefreshDatabase) ; le disque `public` est simulé.
 */
class ImportateurImageTvaTest extends TestCase
{
    use RefreshDatabase;

    private const URL = '/api/v1/importateur-tva/image';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
        Storage::fake('public');
    }

    // ------------------------------------------------------------------ helpers

    private function admin(): User
    {
        return User::factory()->create(['is_admin' => true]);
    }

    /** @param  array<int, string>  $actions */
    private function staff(array $actions): User
    {
        $user = User::factory()->create(['is_admin' => false]);
        foreach ($actions as $action) {
            $permission = Permission::where('module', 'declaration')->where('action', $action)->firstOrFail();
            UserPermission::create(['user_id' => $user->id, 'permission_id' => $permission->id, 'granted_at' => now()]);
        }

        return $user;
    }

    /** PNG réel de la taille demandée (zlib suffit : l'extension GD n'est pas garantie en ligne de commande). */
    private function png(int $largeur, int $hauteur): string
    {
        $morceau = fn (string $type, string $donnees) => pack('N', strlen($donnees)).$type.$donnees.pack('N', crc32($type.$donnees));
        $lignes = str_repeat("\x00".str_repeat("\x80", $largeur), $hauteur); // niveaux de gris 8 bits

        return "\x89PNG\r\n\x1a\n"
            .$morceau('IHDR', pack('NNCCCCC', $largeur, $hauteur, 8, 0, 0, 0, 0))
            .$morceau('IDAT', gzcompress($lignes))
            .$morceau('IEND', '');
    }

    /** En-têtes d'un WebP sans perte (VP8L) : suffisent au contrôle de format et de dimensions du serveur, qui ne décode pas l'image. */
    private function webp(int $largeur, int $hauteur): string
    {
        $charge = "\x2f".pack('V', ($largeur - 1) | (($hauteur - 1) << 14)).str_repeat("\x00", 8);
        $charge .= strlen($charge) % 2 ? "\x00" : '';
        $morceau = 'VP8L'.pack('V', strlen($charge)).$charge;

        return 'RIFF'.pack('V', 4 + strlen($morceau)).'WEBP'.$morceau;
    }

    private function envoyer(User $u, UploadedFile $fichier)
    {
        return $this->actingAs($u)->post(self::URL, ['fichier' => $fichier], ['Accept' => 'application/json']);
    }

    private function fichier(string $nom, string $contenu, string $type): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($nom, $contenu)->mimeType($type);
    }

    private function aucuneEcriture(): void
    {
        $this->assertSame(0, DeclarationTva::count(), 'Aucune déclaration ne doit être créée.');
        $this->assertSame(0, DeclarationTvaLigne::count(), 'Aucune ligne ne doit être créée.');
        $this->assertSame([], Storage::disk('public')->allFiles(), "L'image ne doit pas être conservée.");
    }

    // ------------------------------------------------------------------ image acceptée

    public function test_une_photo_png_de_declaration_est_acceptee_et_rien_n_est_cree(): void
    {
        $reponse = $this->envoyer($this->admin(), $this->fichier('declaration.png', $this->png(800, 1000), 'image/png'));

        $reponse->assertOk()
            ->assertJsonPath('recue', true)
            ->assertJsonPath('nom', 'declaration.png')
            ->assertJsonPath('type', 'image/png')
            ->assertJsonPath('largeur', 800)
            ->assertJsonPath('hauteur', 1000)
            ->assertJsonPath('lignes_creees', 0);
        $this->aucuneEcriture();
    }

    public function test_une_photo_jpeg_est_acceptee(): void
    {
        $contenu = file_get_contents(base_path('tests/Fixtures/declaration-tva-320x400.jpg'));

        $this->envoyer($this->admin(), $this->fichier('photo.jpg', $contenu, 'image/jpeg'))
            ->assertOk()->assertJsonPath('type', 'image/jpeg')->assertJsonPath('largeur', 320)->assertJsonPath('hauteur', 400);
        $this->aucuneEcriture();
    }

    public function test_une_image_webp_est_acceptee(): void
    {
        $this->envoyer($this->admin(), $this->fichier('photo.webp', $this->webp(640, 480), 'image/webp'))
            ->assertOk()->assertJsonPath('type', 'image/webp')->assertJsonPath('largeur', 640);
        $this->aucuneEcriture();
    }

    public function test_la_reponse_dit_que_l_analyse_se_fait_dans_le_navigateur_et_ne_contient_aucune_donnee_extraite(): void
    {
        $reponse = $this->envoyer($this->admin(), $this->fichier('d.png', $this->png(400, 400), 'image/png'))->assertOk();

        $reponse->assertJsonPath('analyse.lieu', 'navigateur')
            ->assertJsonPath('analyse.message', ImageDeclarationTva::MESSAGE_ANALYSE)
            ->assertJsonPath('categorie', 'image')
            ->assertJsonPath('lignes_creees', 0);
        $this->assertStringContainsString('dans votre navigateur', $reponse->json('analyse.message'));
        $this->assertStringContainsString("rien n'est enregistré", $reponse->json('analyse.message'));
        // Le serveur n'extrait rien : la réponse ne contient aucun champ de déclaration.
        foreach (['lignes', 'ht', 'tva', 'ttc', 'total_ht', 'entreprise', 'periode'] as $champ) {
            $this->assertArrayNotHasKey($champ, $reponse->json());
        }
    }
    public function test_le_nom_envoye_est_nettoye(): void
    {
        $this->envoyer($this->admin(), $this->fichier("../../etc/passwd\x07.png", $this->png(300, 300), 'image/png'))
            ->assertOk()->assertJsonPath('nom', "passwd.png");
    }

    // ------------------------------------------------------------------ formats invalides

    /** @return array<string, array{0: string, 1: string, 2: string, 3: string}> nom, contenu, type, mot du message */
    public static function formatsInvalides(): array
    {
        return [
            'texte déguisé en PDF' => ['declaration.pdf', 'ceci est du texte, pas un PDF', 'application/pdf', 'PDF'],
            'Excel' => ['declaration.xlsx', "PK\x03\x04".str_repeat("\x00", 40), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image'],
            'CSV' => ['declaration.csv', "HT;TVA\n100;20\n", 'text/csv', 'image'],
            'texte déguisé en PNG' => ['declaration.png', 'ceci est du texte, pas une image', 'image/png', 'image'],
            'script PHP déguisé en JPG' => ['photo.jpg', '<?php echo 1;', 'image/jpeg', 'image'],
            'SVG' => ['declaration.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><script>alert(1)</script></svg>', 'image/svg+xml', 'image'],
            'HEIC' => ['IMG_0001.heic', "\x00\x00\x00\x18ftypheic".str_repeat("\x00", 40), 'image/heic', 'image'],
            'fichier vide' => ['vide.png', '', 'image/png', 'image'],
        ];
    }

    #[DataProvider('formatsInvalides')]
    public function test_un_format_invalide_est_refuse_avec_un_message_clair_et_rien_n_est_cree(string $nom, string $contenu, string $type, string $mot): void
    {
        $reponse = $this->envoyer($this->admin(), $this->fichier($nom, $contenu, $type))->assertStatus(422)->assertJsonValidationErrors(['fichier']);

        $message = $reponse->json('errors.fichier.0');
        $this->assertStringContainsString($mot, $message);
        $this->assertDoesNotMatchRegularExpression('/validation\.|The .* field/', $message, 'Le message doit être en français.');
        $this->aucuneEcriture();
    }

    public function test_un_gif_est_refuse_car_seules_les_photos_jpg_png_webp_sont_acceptees(): void
    {
        $gif = base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');

        $this->envoyer($this->admin(), $this->fichier('animation.gif', $gif, 'image/gif'))
            ->assertStatus(422)->assertJsonValidationErrors(['fichier']);
        $this->aucuneEcriture();
    }

    public function test_une_image_trop_lourde_est_refusee(): void
    {
        $this->envoyer($this->admin(), UploadedFile::fake()->create('grosse.png', ImageDeclarationTva::TAILLE_MAX_KO + 200, 'image/png'))
            ->assertStatus(422)->assertJsonValidationErrors(['fichier']);
        $this->aucuneEcriture();
    }

    public function test_une_image_trop_petite_est_refusee_avec_ses_dimensions_minimales(): void
    {
        $reponse = $this->envoyer($this->admin(), $this->fichier('icone.png', $this->png(100, 100), 'image/png'))
            ->assertStatus(422)->assertJsonValidationErrors(['fichier']);

        $this->assertStringContainsString('300', $reponse->json('errors.fichier.0'));
        $this->aucuneEcriture();
    }

    public function test_sans_fichier_la_reponse_est_un_message_clair(): void
    {
        $this->actingAs($this->admin())->postJson(self::URL, [])->assertStatus(422)->assertJsonValidationErrors(['fichier']);
        $this->aucuneEcriture();
    }

    // ------------------------------------------------------------------ PDF

    /** PDF minimal mais valide (signature, pages, fin de fichier). */
    private function pdf(string $extra = '', int $pages = 1, bool $fin = true): string
    {
        $objets = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count {$pages} >>\nendobj\n";
        for ($i = 0; $i < $pages; $i++) {
            $objets .= (3 + $i)." 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>\nendobj\n";
        }

        return "%PDF-1.4\n".$objets.$extra."trailer\n<< /Root 1 0 R >>\n".($fin ? "%%EOF\n" : '');
    }

    public function test_un_pdf_valide_est_accepte_et_rien_n_est_cree(): void
    {
        $reponse = $this->envoyer($this->admin(), $this->fichier('declaration.pdf', $this->pdf(pages: 3), 'application/pdf'));

        $reponse->assertOk()
            ->assertJsonPath('recue', true)
            ->assertJsonPath('categorie', 'pdf')
            ->assertJsonPath('type', 'application/pdf')
            ->assertJsonPath('pages', 3)
            ->assertJsonPath('largeur', null)
            ->assertJsonPath('lignes_creees', 0);
        $this->aucuneEcriture();
    }

    public function test_le_pdf_d_exemple_fourni_est_accepte(): void
    {
        $contenu = file_get_contents(base_path('tests/Fixtures/declaration_TVA_CA3_exemple.pdf'));

        $this->envoyer($this->admin(), $this->fichier('declaration_TVA_CA3_exemple.pdf', $contenu, 'application/pdf'))
            ->assertOk()->assertJsonPath('categorie', 'pdf')->assertJsonPath('pages', 2);
        $this->aucuneEcriture();
    }

    public function test_un_pdf_scanne_sans_texte_est_accepte_par_le_serveur(): void
    {
        // PDF « scanné » : une image par page, aucun texte (lu ensuite par OCR dans le navigateur). Le serveur ne contrôle que sa structure.
        $contenu = file_get_contents(base_path('tests/Fixtures/declaration_TVA_CA3_scan.pdf'));

        $this->envoyer($this->admin(), $this->fichier('scan.pdf', $contenu, 'application/pdf'))
            ->assertOk()->assertJsonPath('categorie', 'pdf')->assertJsonPath('pages', 1)->assertJsonPath('lignes_creees', 0);
        $this->aucuneEcriture();
    }
    /** @return array<string, array{0: string, 1: string}> */
    public static function pdfInvalides(): array
    {
        return [
            'protégé par mot de passe' => ['/Encrypt 9 0 R', 'mot de passe'],
            'JavaScript' => ['/JS (app.alert(1))', 'éléments actifs'],
            'lancement de programme' => ['/Launch', 'éléments actifs'],
            'fichier incorporé' => ['/EmbeddedFile', 'éléments actifs'],
        ];
    }

    #[DataProvider('pdfInvalides')]
    public function test_un_pdf_dangereux_ou_protege_est_refuse(string $extra, string $mot): void
    {
        $reponse = $this->envoyer($this->admin(), $this->fichier('declaration.pdf', $this->pdf($extra."\n"), 'application/pdf'))
            ->assertStatus(422)->assertJsonValidationErrors(['fichier']);

        $this->assertStringContainsString($mot, $reponse->json('errors.fichier.0'));
        $this->aucuneEcriture();
    }

    public function test_un_pdf_incomplet_ou_avec_trop_de_pages_est_refuse(): void
    {
        $incomplet = $this->envoyer($this->admin(), $this->fichier('coupe.pdf', $this->pdf(fin: false), 'application/pdf'))
            ->assertStatus(422)->assertJsonValidationErrors(['fichier']);
        $this->assertStringContainsString('incomplet', $incomplet->json('errors.fichier.0'));

        $long = $this->envoyer($this->admin(), $this->fichier('long.pdf', $this->pdf(pages: ImageDeclarationTva::PAGES_MAX + 1), 'application/pdf'))
            ->assertStatus(422)->assertJsonValidationErrors(['fichier']);
        $this->assertStringContainsString('trop de pages', $long->json('errors.fichier.0'));
        $this->aucuneEcriture();
    }

    public function test_un_pdf_trop_lourd_est_refuse(): void
    {
        $this->envoyer($this->admin(), UploadedFile::fake()->create('gros.pdf', ImageDeclarationTva::TAILLE_MAX_KO + 200, 'application/pdf'))
            ->assertStatus(422)->assertJsonValidationErrors(['fichier']);
        $this->aucuneEcriture();
    }

    public function test_les_deux_formats_sont_acceptes_pour_une_meme_permission(): void
    {
        $u = $this->staff(['importeur']);

        $this->envoyer($u, $this->fichier('a.pdf', $this->pdf(), 'application/pdf'))->assertOk()->assertJsonPath('categorie', 'pdf');
        $this->envoyer($u, $this->fichier('a.png', $this->png(400, 400), 'image/png'))->assertOk()->assertJsonPath('categorie', 'image');
    }
    // ------------------------------------------------------------------ droits

    public function test_sans_connexion_la_route_est_refusee(): void
    {
        $this->post(self::URL, ['fichier' => $this->fichier('d.png', $this->png(400, 400), 'image/png')], ['Accept' => 'application/json'])->assertStatus(401);
    }

    public function test_sans_la_permission_importeur_la_route_est_refusee(): void
    {
        $this->envoyer($this->staff(['liste', 'modifier', 'ajouter']), $this->fichier('d.png', $this->png(400, 400), 'image/png'))->assertStatus(403);
        $this->aucuneEcriture();
    }

    public function test_avec_la_seule_permission_importeur_l_image_est_acceptee(): void
    {
        $this->envoyer($this->staff(['importeur']), $this->fichier('d.png', $this->png(400, 400), 'image/png'))->assertOk();
        $this->aucuneEcriture();
    }
}
