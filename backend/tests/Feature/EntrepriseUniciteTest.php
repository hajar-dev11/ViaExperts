<?php

namespace Tests\Feature;

use App\Models\Entreprise;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Entreprises : Dénomination, I.C.E et Identifiant Fiscal uniques (création ET modification) ; l'entreprise elle-même n'est
 * jamais un doublon ; le RC garde la règle existante (unique par tribunal) et le TP peut être commun.
 */
class EntrepriseUniciteTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create(['is_admin' => true]);
    }

    private function creer(User $u, array $champs)
    {
        return $this->actingAs($u)->postJson('/api/v1/entreprises', array_merge(['forme' => 'SARL', 'periode' => 'Mensuel'], $champs));
    }

    // ---- Dénomination --------------------------------------------------------------------------------------------

    public function test_deux_entreprises_ne_peuvent_pas_avoir_la_meme_denomination(): void
    {
        $u = $this->admin();
        $this->creer($u, ['denomination' => 'Atlas Trading'])->assertStatus(201);

        $reponse = $this->creer($u, ['denomination' => 'Atlas Trading'])->assertStatus(422)->assertJsonValidationErrors(['denomination']);

        $this->assertSame('Une entreprise avec cette dénomination existe déjà.', $reponse->json('errors.denomination.0'));
        $this->assertSame(1, Entreprise::where('denomination', 'Atlas Trading')->count());
    }

    public function test_la_denomination_est_comparee_sans_casse_ni_accent_ni_espaces_superflus(): void
    {
        $u = $this->admin();
        $this->creer($u, ['denomination' => 'Société Générale du Nord'])->assertStatus(201);

        foreach (['SOCIÉTÉ GÉNÉRALE DU NORD', 'societe generale du nord', '  Société Générale du Nord  ', 'Société  Générale   du Nord'] as $variante) {
            $this->creer($u, ['denomination' => $variante])->assertStatus(422)->assertJsonValidationErrors(['denomination']);
        }
        $this->assertSame(1, Entreprise::count());
    }

    public function test_une_denomination_deja_prise_par_une_entreprise_archivee_ou_bloquee_est_refusee(): void
    {
        $u = $this->admin();
        $id = $this->creer($u, ['denomination' => 'Entreprise Archivee'])->json('data.id');
        $this->actingAs($u)->postJson("/api/v1/entreprises/{$id}/archive")->assertOk();

        $this->creer($u, ['denomination' => 'Entreprise Archivee'])->assertStatus(422)->assertJsonValidationErrors(['denomination']);
    }

    public function test_modifier_une_entreprise_sans_changer_son_nom_n_est_pas_un_doublon(): void
    {
        $u = $this->admin();
        $id = $this->creer($u, ['denomination' => 'Ma Societe', 'ice' => 'ICE-1', 'if' => 'IF-1'])->json('data.id');

        $this->actingAs($u)->putJson("/api/v1/entreprises/{$id}", [
            'denomination' => 'Ma Societe', 'ice' => 'ICE-1', 'if' => 'IF-1', 'observation' => 'Note',
        ])->assertOk()->assertJsonPath('data.observation', 'Note');
        // Même nom écrit autrement (casse) : toujours la même entreprise.
        $this->actingAs($u)->putJson("/api/v1/entreprises/{$id}", ['denomination' => 'MA SOCIETE'])->assertOk();
    }

    public function test_renommer_une_entreprise_avec_le_nom_d_une_autre_est_refuse(): void
    {
        $u = $this->admin();
        $this->creer($u, ['denomination' => 'Premiere'])->assertStatus(201);
        $id = $this->creer($u, ['denomination' => 'Seconde'])->json('data.id');

        $this->actingAs($u)->putJson("/api/v1/entreprises/{$id}", ['denomination' => 'premiere'])
            ->assertStatus(422)->assertJsonValidationErrors(['denomination']);
        $this->assertSame('Seconde', Entreprise::findOrFail($id)->denomination);
    }

    public function test_une_entreprise_deja_en_double_reste_modifiable_tant_que_son_nom_ne_change_pas(): void
    {
        $u = $this->admin();
        $this->creer($u, ['denomination' => 'Ancien Doublon'])->assertStatus(201);
        $id = $this->creer($u, ['denomination' => 'Autre Nom'])->json('data.id');
        // Donnée ancienne (avant la règle) : deux entreprises au même nom, insérée directement.
        Entreprise::whereKey($id)->update(['denomination' => 'Ancien Doublon']);

        // Modifier un autre champ n'est pas bloqué par un doublon que l'entreprise n'a pas créé.
        $this->actingAs($u)->putJson("/api/v1/entreprises/{$id}", ['denomination' => 'Ancien Doublon', 'observation' => 'Corrigée'])
            ->assertOk();
    }

    // ---- ICE / IF ------------------------------------------------------------------------------------------------

    public function test_ice_et_if_sont_uniques_a_la_creation_et_a_la_modification_sans_bloquer_l_entreprise_elle_meme(): void
    {
        $u = $this->admin();
        $a = $this->creer($u, ['denomination' => 'Societe A', 'ice' => 'ICE-A', 'if' => 'IF-A'])->json('data.id');
        $this->creer($u, ['denomination' => 'Societe B', 'ice' => 'ICE-B', 'if' => 'IF-B'])->assertStatus(201);

        // Création avec ICE ou IF déjà pris.
        $this->creer($u, ['denomination' => 'Societe C', 'ice' => 'ICE-A'])->assertStatus(422)->assertJsonValidationErrors(['ice']);
        $this->creer($u, ['denomination' => 'Societe D', 'if' => 'IF-B'])->assertStatus(422)->assertJsonValidationErrors(['if']);

        // Modification vers l'ICE/IF d'une autre entreprise : refusée ; vers sa propre valeur : acceptée.
        $this->actingAs($u)->putJson("/api/v1/entreprises/{$a}", ['ice' => 'ICE-B'])->assertStatus(422)->assertJsonValidationErrors(['ice']);
        $this->actingAs($u)->putJson("/api/v1/entreprises/{$a}", ['if' => 'IF-B'])->assertStatus(422)->assertJsonValidationErrors(['if']);
        $this->actingAs($u)->putJson("/api/v1/entreprises/{$a}", ['ice' => 'ICE-A', 'if' => 'IF-A'])->assertOk();
    }

    public function test_les_messages_d_unicite_sont_clairs(): void
    {
        $u = $this->admin();
        $this->creer($u, ['denomination' => 'Societe A', 'ice' => 'ICE-A', 'if' => 'IF-A'])->assertStatus(201);

        $reponse = $this->creer($u, ['denomination' => 'Societe A', 'ice' => 'ICE-A', 'if' => 'IF-A'])->assertStatus(422);

        $this->assertSame('Une entreprise avec cette dénomination existe déjà.', $reponse->json('errors.denomination.0'));
        $this->assertSame('Une entreprise avec cet I.C.E existe déjà.', $reponse->json('errors.ice.0'));
        $this->assertSame('Une entreprise avec cet Identifiant Fiscal existe déjà.', $reponse->json('errors.if.0'));
    }

    public function test_ice_et_if_vides_ne_sont_pas_consideres_comme_des_doublons(): void
    {
        $u = $this->admin();

        $this->creer($u, ['denomination' => 'Sans Identifiants 1'])->assertStatus(201);
        $this->creer($u, ['denomination' => 'Sans Identifiants 2', 'ice' => '', 'if' => ''])->assertStatus(201);
        $this->creer($u, ['denomination' => 'Sans Identifiants 3', 'ice' => null, 'if' => null])->assertStatus(201);
    }

    // ---- RC / TP -------------------------------------------------------------------------------------------------

    public function test_le_tp_peut_etre_identique_et_le_rc_aussi_dans_un_autre_tribunal(): void
    {
        $u = $this->admin();
        $this->creer($u, ['denomination' => 'RC A', 'tp' => 'TP-1', 'rc' => '1000', 'tribunal' => 'Casablanca'])->assertStatus(201);

        // TP commun : accepté. Même RC dans un autre tribunal : accepté (règle existante : unique PAR tribunal).
        $this->creer($u, ['denomination' => 'RC B', 'tp' => 'TP-1', 'rc' => '1000', 'tribunal' => 'Rabat'])->assertStatus(201);
        // Même RC dans le même tribunal : refusé (règle existante conservée).
        $this->creer($u, ['denomination' => 'RC C', 'rc' => '1000', 'tribunal' => 'Casablanca'])->assertStatus(422)->assertJsonValidationErrors(['rc']);
    }
}
