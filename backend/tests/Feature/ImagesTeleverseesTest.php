<?php

namespace Tests\Feature;

use App\Exceptions\Handler;
use App\Models\User;
use Illuminate\Contracts\Debug\ExceptionHandler;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Exceptions\PostTooLargeException;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Upload des photos et images de paramétrage (photo de profil, logos, signatures) : tailles et formats acceptés,
 * messages d'erreur en français, enregistrement dans un VRAI dossier public (hébergement sans lien symbolique)
 * et dossier choisi pour le disque « public ».
 */
class ImagesTeleverseesTest extends TestCase
{
    use RefreshDatabase;

    /** PNG 1×1 réel (l'extension GD n'est pas garantie pour `UploadedFile::fake()->image`). */
    private function png(): string
    {
        return base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
    }

    private function utilisateur(): User
    {
        return User::factory()->create(['is_admin' => false]);
    }

    public function test_une_photo_de_1_5_mo_est_acceptee(): void
    {
        Storage::fake('public');

        // Avant : refusée au-delà de 800 Ko, alors qu'une photo de téléphone dépasse presque toujours cette taille.
        $this->actingAs($this->utilisateur())->postJson('/api/v1/profile/photo', [
            'file' => UploadedFile::fake()->create('photo.jpg', 1500, 'image/jpeg'),
        ])->assertOk();
    }

    public function test_une_image_de_plus_de_2_mo_est_refusee_avec_un_message_clair_en_francais(): void
    {
        Storage::fake('public');

        $reponse = $this->actingAs($this->utilisateur())->postJson('/api/v1/profile/photo', [
            'file' => UploadedFile::fake()->create('grosse.jpg', 2100, 'image/jpeg'),
        ])->assertStatus(422)->assertJsonValidationErrors('file');

        $message = $reponse->json('errors.file.0');
        $this->assertStringContainsString('2 Mo', $message);
        $this->assertStringContainsString('image', $message);
        $this->assertStringNotContainsString('kilobytes', $message);
    }

    public function test_un_format_non_pris_en_charge_donne_un_message_en_francais(): void
    {
        Storage::fake('public');

        $reponse = $this->actingAs($this->utilisateur())->postJson('/api/v1/profile/photo', [
            'file' => UploadedFile::fake()->create('photo.webp', 40, 'image/webp'),
        ])->assertStatus(422);

        $this->assertStringContainsString('JPG, PNG ou GIF', $reponse->json('errors.file.0'));
    }

    public function test_un_fichier_qui_nest_pas_une_image_donne_un_message_en_francais(): void
    {
        Storage::fake('public');

        $reponse = $this->actingAs($this->utilisateur())->postJson('/api/v1/profile/photo', [
            'file' => UploadedFile::fake()->create('document.pdf', 40, 'application/pdf'),
        ])->assertStatus(422);

        $this->assertStringContainsString("n'est pas une image", $reponse->json('errors.file.0'));
    }

    public function test_aucune_image_recue_donne_un_message_utile(): void
    {
        // Cas réel : l'envoi dépasse `post_max_size` ou `upload_max_filesize`, PHP écarte le fichier avant Laravel.
        $reponse = $this->actingAs($this->utilisateur())->postJson('/api/v1/profile/photo', [])
            ->assertStatus(422)->assertJsonValidationErrors('file');

        $this->assertStringContainsString("Aucune image n'a été reçue", $reponse->json('errors.file.0'));
    }

    public function test_les_logos_et_signatures_utilisent_les_memes_regles(): void
    {
        Storage::fake('public');
        $admin = User::factory()->create(['is_admin' => true]);

        foreach (['/api/v1/settings/cabinet/logo', '/api/v1/settings/cabinet/signature', '/api/v1/settings/domiciliation/logo', '/api/v1/settings/domiciliation/signature'] as $url) {
            $this->actingAs($admin)->postJson($url, ['file' => UploadedFile::fake()->create('a.png', 1500, 'image/png')])->assertOk();

            $reponse = $this->actingAs($admin)->postJson($url, ['file' => UploadedFile::fake()->create('b.png', 2100, 'image/png')])->assertStatus(422);
            $this->assertStringContainsString('2 Mo', $reponse->json('errors.file.0'), $url);
        }
    }

    public function test_un_envoi_trop_volumineux_renvoie_un_413_json_en_francais(): void
    {
        $requete = Request::create('/api/v1/profile/photo', 'POST', server: ['HTTP_ACCEPT' => 'application/json']);

        $reponse = $this->app->make(ExceptionHandler::class)->render($requete, new PostTooLargeException());

        $this->assertInstanceOf(Handler::class, $this->app->make(ExceptionHandler::class));
        $this->assertSame(413, $reponse->getStatusCode());
        $this->assertStringContainsString('trop volumineux', $reponse->getData(true)['message']);
    }

    public function test_les_regles_d_image_gardent_une_liste_blanche_de_formats_sans_script(): void
    {
        // Garde-fou : la règle centralisée remplace les `mimes:` écrits dans chaque contrôleur (voir UploadSecurityTest).
        $regles = \App\Support\ImageTeleversee::regles();

        $this->assertContains('image', $regles);
        $this->assertContains('mimes:jpg,jpeg,png,gif', $regles);
        $this->assertContains('required', $regles);
        $this->assertSame('max:2048', collect($regles)->first(fn ($r) => str_starts_with($r, 'max:')));
        $this->assertStringNotContainsString('svg', implode(',', $regles));
    }

    public function test_un_script_deguise_en_image_est_refuse(): void
    {
        Storage::fake('public');

        // Vrai fichier temporaire (et non `UploadedFile::fake()`, qui déclare son type d'après le NOM) : le contenu réel
        // est inspecté, comme pour un envoi du navigateur.
        $chemin = tempnam(sys_get_temp_dir(), 'via-img-');
        file_put_contents($chemin, '<?php echo "pirate"; ?>');

        try {
            $faux = new UploadedFile($chemin, 'photo.png', 'image/png', null, true);

            $this->actingAs($this->utilisateur())->postJson('/api/v1/profile/photo', ['file' => $faux])
                ->assertStatus(422)->assertJsonValidationErrors('file');
        } finally {
            @unlink($chemin);
        }

        $this->assertSame([], Storage::disk('public')->allFiles());
    }
}
