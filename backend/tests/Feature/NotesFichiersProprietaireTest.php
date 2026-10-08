<?php

namespace Tests\Feature;

use App\Models\Fichier;
use App\Models\Note;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Notes et Fichiers sont PERSONNELS : un utilisateur connecté ne lit, ne modifie et ne supprime que les siens.
 * L'administrateur garde l'accès à tout. Contrôle côté serveur (masquer l'élément dans l'écran ne suffit pas).
 */
class NotesFichiersProprietaireTest extends TestCase
{
    use RefreshDatabase;

    private User $alice;
    private User $bob;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');

        $this->alice = User::factory()->create(['is_admin' => false]);
        $this->bob = User::factory()->create(['is_admin' => false]);
        $this->admin = User::factory()->create(['is_admin' => true]);
    }

    private function note(User $auteur, string $titre = 'Note'): Note
    {
        return Note::create(['titre' => $titre, 'contenu' => 'contenu de '.$titre, 'created_by' => $auteur->id]);
    }

    private function fichier(User $auteur, string $nom = 'doc.pdf'): Fichier
    {
        $chemin = 'fichiers/'.uniqid().'.pdf';
        Storage::disk('public')->put($chemin, '%PDF-1.4 test');

        return Fichier::create(['nom' => $nom, 'chemin' => $chemin, 'mime' => 'application/pdf', 'taille' => 13, 'created_by' => $auteur->id]);
    }

    // --- Notes -----------------------------------------------------------------------------------------------------

    public function test_la_liste_des_notes_ne_contient_que_les_notes_de_l_utilisateur(): void
    {
        $mienne = $this->note($this->alice, 'À moi');
        $this->note($this->bob, 'À Bob');

        $ids = collect($this->actingAs($this->alice)->getJson('/api/v1/notes')->assertOk()->json())->pluck('id')->all();

        $this->assertSame([$mienne->id], $ids);
    }

    public function test_modifier_la_note_d_un_autre_utilisateur_est_refuse(): void
    {
        $noteDeBob = $this->note($this->bob, 'Privée');

        $this->actingAs($this->alice)->putJson("/api/v1/notes/{$noteDeBob->id}", ['titre' => 'Piratée', 'contenu' => 'x'])->assertStatus(403);

        $this->assertSame('Privée', $noteDeBob->fresh()->titre);
    }

    public function test_supprimer_la_note_d_un_autre_utilisateur_est_refuse(): void
    {
        $noteDeBob = $this->note($this->bob);

        $this->actingAs($this->alice)->deleteJson("/api/v1/notes/{$noteDeBob->id}")->assertStatus(403);

        $this->assertNotNull(Note::find($noteDeBob->id));
    }

    public function test_un_utilisateur_gere_librement_ses_propres_notes(): void
    {
        $id = $this->actingAs($this->alice)->postJson('/api/v1/notes', ['titre' => 'Ma note', 'contenu' => 'a'])->assertStatus(201)->json('id');

        $this->actingAs($this->alice)->putJson("/api/v1/notes/{$id}", ['contenu' => 'b'])->assertOk()->assertJsonPath('contenu', 'b');
        $this->assertSame([$id], collect($this->actingAs($this->alice)->getJson('/api/v1/notes')->json())->pluck('id')->all());
        $this->actingAs($this->alice)->deleteJson("/api/v1/notes/{$id}")->assertOk();
        $this->assertNull(Note::find($id));
    }

    public function test_l_administrateur_garde_l_acces_a_toutes_les_notes(): void
    {
        $noteDeBob = $this->note($this->bob);
        $this->note($this->alice);

        $this->assertCount(2, $this->actingAs($this->admin)->getJson('/api/v1/notes')->assertOk()->json());
        $this->actingAs($this->admin)->putJson("/api/v1/notes/{$noteDeBob->id}", ['titre' => 'Corrigée'])->assertOk();
        $this->actingAs($this->admin)->deleteJson("/api/v1/notes/{$noteDeBob->id}")->assertOk();
    }

    public function test_les_notes_exigent_d_etre_connecte(): void
    {
        $note = $this->note($this->bob);

        $this->getJson('/api/v1/notes')->assertStatus(401);
        $this->putJson("/api/v1/notes/{$note->id}", ['titre' => 'x'])->assertStatus(401);
        $this->deleteJson("/api/v1/notes/{$note->id}")->assertStatus(401);
    }

    // --- Fichiers --------------------------------------------------------------------------------------------------

    public function test_la_liste_des_fichiers_ne_contient_que_les_fichiers_de_l_utilisateur(): void
    {
        $mien = $this->fichier($this->alice, 'mien.pdf');
        $this->fichier($this->bob, 'bob.pdf');

        $ids = collect($this->actingAs($this->alice)->getJson('/api/v1/fichiers')->assertOk()->json())->pluck('id')->all();

        $this->assertSame([$mien->id], $ids);
    }

    public function test_supprimer_le_fichier_d_un_autre_utilisateur_est_refuse_et_le_fichier_reste_stocke(): void
    {
        $fichierDeBob = $this->fichier($this->bob);

        $this->actingAs($this->alice)->deleteJson("/api/v1/fichiers/{$fichierDeBob->id}")->assertStatus(403);

        $this->assertNotNull(Fichier::find($fichierDeBob->id));
        Storage::disk('public')->assertExists($fichierDeBob->chemin);
    }

    public function test_un_utilisateur_envoie_liste_et_supprime_ses_propres_fichiers(): void
    {
        $pdf = UploadedFile::fake()->createWithContent('rapport.pdf', "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

        $cree = $this->actingAs($this->alice)->post('/api/v1/fichiers', ['fichiers' => [$pdf]], ['Accept' => 'application/json'])
            ->assertStatus(201)->json();
        $this->assertCount(1, $cree);
        $this->assertSame($this->alice->id, Fichier::findOrFail($cree[0]['id'])->created_by);

        $this->assertSame([$cree[0]['id']], collect($this->actingAs($this->alice)->getJson('/api/v1/fichiers')->json())->pluck('id')->all());
        $this->actingAs($this->alice)->deleteJson("/api/v1/fichiers/{$cree[0]['id']}")->assertOk();
        $this->assertNull(Fichier::find($cree[0]['id']));
    }

    public function test_l_administrateur_garde_l_acces_a_tous_les_fichiers(): void
    {
        $fichierDeBob = $this->fichier($this->bob);
        $this->fichier($this->alice);

        $this->assertCount(2, $this->actingAs($this->admin)->getJson('/api/v1/fichiers')->assertOk()->json());
        $this->actingAs($this->admin)->deleteJson("/api/v1/fichiers/{$fichierDeBob->id}")->assertOk();
        Storage::disk('public')->assertMissing($fichierDeBob->chemin);
    }

    public function test_les_fichiers_exigent_d_etre_connecte(): void
    {
        $fichier = $this->fichier($this->bob);

        $this->getJson('/api/v1/fichiers')->assertStatus(401);
        $this->deleteJson("/api/v1/fichiers/{$fichier->id}")->assertStatus(401);
    }
}
