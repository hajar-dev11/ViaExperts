<?php

namespace Tests\Feature;

use App\Models\Fichier;
use App\Models\User;
use App\Rules\FichierAutorise;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Tests\TestCase;

/**
 * Sécurité des téléversements : liste blanche (extension + contenu réel + nom), aucun fichier exécutable
 * ne peut atterrir ni être servi depuis le stockage public.
 */
class UploadSecurityTest extends TestCase
{
    use RefreshDatabase;

    private const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    private function png(): string
    {
        return base64_decode(self::PNG_1X1);
    }

    private function fichier(string $nom, string $contenu): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($nom, $contenu);
    }

    private function valide(UploadedFile $fichier, ?FichierAutorise $regle = null): bool
    {
        return Validator::make(['f' => $fichier], ['f' => ['file', $regle ?? FichierAutorise::document()]])->passes();
    }

    // ------------------------------------------------------------------ règle de liste blanche

    public function test_documents_legitimes_acceptes(): void
    {
        $this->assertTrue($this->valide($this->fichier('contrat.pdf', "%PDF-1.4\n1 0 obj\n<< >>\nendobj\ntrailer\n<< >>\n%%EOF\n")));
        $this->assertTrue($this->valide($this->fichier('photo.png', $this->png())));
        $this->assertTrue($this->valide($this->fichier('PHOTO.PNG', $this->png())), 'extension en majuscules');
        $this->assertTrue($this->valide($this->fichier('notes.txt', "Bonjour\nceci est une note\n")));
        $this->assertTrue($this->valide($this->fichier('liste.csv', "nom;montant\nA;10\n")));
    }

    public function test_script_php_deguise_est_refuse_quelle_que_soit_l_extension(): void
    {
        $php = "<?php echo shell_exec(\$_GET['c']); ?>";

        foreach (['shell.php', 'shell.phtml', 'shell.phar', 'facture.pdf', 'image.png', 'notes.txt', 'a.php.pdf'] as $nom) {
            $this->assertFalse($this->valide($this->fichier($nom, $php)), "{$nom} contenant du PHP doit être refusé");
        }
    }

    public function test_extensions_interdites_refusees_meme_avec_un_contenu_inoffensif(): void
    {
        foreach (['a.php', 'a.php3', 'a.php5', 'a.phtml', 'a.phar', 'a.cgi', 'a.pl', 'a.py', 'a.sh', 'a.exe', 'a.js', 'a.html', 'a.htm', 'a.svg', 'a.jsp', 'a.aspx', '.htaccess', 'sans-extension'] as $nom) {
            $this->assertFalse($this->valide($this->fichier($nom, 'texte simple')), "{$nom} doit être refusé");
        }
    }

    public function test_double_extension_executable_refusee(): void
    {
        foreach (['shell.php.png', 'SHELL.PHP.PNG', 'x.phtml.pdf', 'a.php5.jpg', 'x.exe.pdf'] as $nom) {
            $this->assertFalse($this->valide($this->fichier($nom, $this->png())), "{$nom} doit être refusé");
        }
    }

    public function test_le_contenu_doit_correspondre_a_l_extension(): void
    {
        $this->assertFalse($this->valide($this->fichier('faux.pdf', $this->png())), 'une image nommée .pdf');
        $this->assertFalse($this->valide($this->fichier('faux.png', "%PDF-1.4\n%%EOF\n")), 'un PDF nommé .png');
    }

    public function test_noms_avec_chemin_sont_neutralises_et_caracteres_de_controle_refuses(): void
    {
        $source = $this->fichier('x.txt', 'texte');

        // Symfony ne conserve que le nom de base : jamais de traversée de chemin dans le nom enregistré.
        foreach (['../../etc/passwd.txt', 'dossier/fichier.txt', 'dossier\\fichier.txt', '/etc/passwd.txt'] as $nom) {
            $fichier = new UploadedFile($source->getPathname(), $nom, 'text/plain', null, true);
            $this->assertStringNotContainsString('/', $fichier->getClientOriginalName());
            $this->assertStringNotContainsString('\\', $fichier->getClientOriginalName());
        }

        // Octet nul et caractères de contrôle : refusés par la règle.
        foreach (["nul\0.txt", "retour\r\nligne.txt", "tab\t.txt"] as $nom) {
            $fichier = new UploadedFile($source->getPathname(), $nom, 'text/plain', null, true);
            $this->assertFalse($this->valide($fichier), 'nom refusé : '.addcslashes($nom, "\0\r\n\t"));
        }
    }
    public function test_archives_refusees_par_defaut_et_acceptees_seulement_la_ou_le_besoin_est_demontre(): void
    {
        $zip = "PK\x05\x06".str_repeat("\0", 18); // archive zip vide mais valide

        $this->assertFalse($this->valide($this->fichier('archive.zip', $zip)), 'document() refuse les archives');
        $this->assertTrue($this->valide($this->fichier('archive.zip', $zip), FichierAutorise::avecArchives()), 'Rapports / Fichiers : zip accepté');
        $this->assertFalse($this->valide($this->fichier('archive.zip', '<?php echo 1;'), FichierAutorise::avecArchives()), 'faux zip refusé');
    }

    // ------------------------------------------------------------------ endpoints réels

    public function test_endpoint_fichiers_refuse_un_script_et_n_ecrit_rien(): void
    {
        Storage::fake('public');
        $admin = User::factory()->create(['is_admin' => true]);

        $this->actingAs($admin)->postJson('/api/v1/fichiers', ['fichiers' => [$this->fichier('shell.pdf', '<?php echo 1;')]])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['fichiers.0']);

        $this->actingAs($admin)->postJson('/api/v1/fichiers', ['fichiers' => [$this->fichier('shell.php', '<?php echo 1;')]])
            ->assertStatus(422);

        $this->assertSame(0, Fichier::count());
        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    public function test_endpoint_fichiers_accepte_un_pdf_et_ne_le_stocke_jamais_sous_une_extension_executable(): void
    {
        Storage::fake('public');
        $admin = User::factory()->create(['is_admin' => true]);

        $this->actingAs($admin)->postJson('/api/v1/fichiers', ['fichiers' => [$this->fichier('Contrat client.pdf', "%PDF-1.4\n%%EOF\n")]])
            ->assertStatus(201);

        $fichier = Fichier::firstOrFail();
        $this->assertSame('Contrat client.pdf', $fichier->nom, 'le nom affiché reste celui de l\'utilisateur');
        $this->assertMatchesRegularExpression('#^fichiers/[A-Za-z0-9]{40}\.pdf$#', $fichier->chemin, 'chemin généré par Laravel, jamais le nom utilisateur');
        Storage::disk('public')->assertExists($fichier->chemin);
    }

    public function test_endpoint_chat_refuse_une_piece_jointe_dangereuse(): void
    {
        Storage::fake('public');
        $moi = User::factory()->create(['is_admin' => true]);
        $autre = User::factory()->create();

        $this->actingAs($moi)->postJson("/api/v1/chat/{$autre->id}/messages", ['body' => 'Voir pièce jointe', 'fichier' => $this->fichier('virus.exe', 'MZ')])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['fichier']);

        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    // ------------------------------------------------------------------ garde-fous d'architecture

    public function test_tout_controleur_qui_stocke_sur_le_disque_public_valide_le_type_du_fichier(): void
    {
        $fichiers = array_merge(
            glob(app_path('Http/Controllers/Api/V1/*.php')),
            glob(app_path('Modules/*/Http/Controllers/*.php'))
        );
        $controles = 0;

        foreach ($fichiers as $fichier) {
            $source = file_get_contents($fichier);

            if (! preg_match("/->store\\(\\s*'[^']+'\\s*,\\s*'public'\\s*\\)/", $source)) {
                continue;
            }

            $controles++;
            $this->assertTrue(
                str_contains($source, 'FichierAutorise::') || str_contains($source, "'mimes:") || str_contains($source, 'ImageTeleversee::regles()'),
                basename($fichier).' stocke un fichier sur le disque public sans liste blanche de types (FichierAutorise, ImageTeleversee ou mimes:).'
            );
        }

        $this->assertGreaterThanOrEqual(10, $controles, 'le scan doit couvrir tous les contrôleurs d\'upload');
    }

    public function test_aucune_validation_de_fichier_sans_liste_blanche(): void
    {
        $fichiers = array_merge(
            glob(app_path('Http/Controllers/Api/V1/*.php')),
            glob(app_path('Http/Requests/*.php')),
            glob(app_path('Modules/*/Http/Controllers/*.php')),
            glob(app_path('Modules/*/Http/Requests/*.php'))
        );

        foreach ($fichiers as $fichier) {
            foreach (file($fichier) as $numero => $ligne) {
                if (preg_match("/'file'\\s*,/", $ligne)) {
                    $this->assertTrue(
                        str_contains($ligne, 'FichierAutorise::') || str_contains($ligne, 'mimes:'),
                        basename($fichier).':'.($numero + 1).' règle `file` sans liste blanche de types.'
                    );
                }
            }
        }
    }

    public function test_les_protections_apache_contre_l_execution_dans_storage_sont_en_place(): void
    {
        $public = file_get_contents(base_path('public/.htaccess'));
        $this->assertStringContainsString('^storage/', $public);
        $this->assertMatchesRegularExpression('/RewriteRule \^storage\/.*php.*\[F,NC,L\]/', $public);
        // La règle de sécurité passe AVANT la réécriture vers index.php.
        $this->assertLessThan(strpos($public, 'index.php'), strpos($public, '^storage/'));

        $storage = file_get_contents(storage_path('app/public/.htaccess'));
        $this->assertStringContainsString('php_flag engine off', $storage);
        $this->assertStringContainsString('RemoveHandler', $storage);
        $this->assertStringContainsString('Require all denied', $storage);
        $this->assertStringContainsString('Options -Indexes', $storage);

        // Le .htaccess du stockage doit être versionné (exception dans le .gitignore du dossier).
        $this->assertStringContainsString('!.htaccess', file_get_contents(storage_path('app/public/.gitignore')));
    }
}
