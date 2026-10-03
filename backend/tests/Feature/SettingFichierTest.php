<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SettingFichierTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_is_rejected(): void
    {
        $this->getJson('/api/v1/settings/fichier?path=settings/cabinet/logo.png')->assertStatus(401);
    }

    public function test_returns_a_stored_settings_image(): void
    {
        Storage::fake('public');
        // PNG 1×1 réel (l'extension GD n'est pas garantie pour `UploadedFile::fake()->image`).
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
        Storage::disk('public')->put('settings/cabinet/logo.png', $png);

        $this->actingAs(User::factory()->create())
            ->get('/api/v1/settings/fichier?path=settings/cabinet/logo.png')
            ->assertOk()
            ->assertHeader('Content-Type', 'image/png');
    }

    public function test_refuses_paths_outside_the_settings_images(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('private/secret.png', 'x');
        Storage::disk('public')->put('settings/cabinet/notes.txt', 'x');
        $user = User::factory()->create();

        foreach ([
            'private/secret.png',
            'settings/cabinet/notes.txt',
            'settings/cabinet/../../private/secret.png',
            'settings/autre/logo.png',
            'settings/cabinet/absent.png',
            '',
        ] as $path) {
            $this->actingAs($user)->get('/api/v1/settings/fichier?path='.urlencode($path))->assertStatus(404);
        }
    }
}
