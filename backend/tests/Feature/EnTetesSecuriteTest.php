<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * En-têtes de sécurité HTTP et proxys de confiance. HSTS n'est jamais émis en HTTP (développement local compris).
 */
class EnTetesSecuriteTest extends TestCase
{
    public function test_les_reponses_de_l_api_portent_les_en_tetes_de_base(): void
    {
        $reponse = $this->getJson('/api/v1/auth/me');

        $reponse->assertStatus(401)
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    }

    public function test_la_page_racine_porte_aussi_les_en_tetes(): void
    {
        $this->get('/')->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff')->assertHeader('X-Frame-Options', 'DENY');
    }

    public function test_hsts_n_est_jamais_envoye_en_http(): void
    {
        $this->getJson('/api/v1/auth/me')->assertHeaderMissing('Strict-Transport-Security');
        $this->get('/')->assertHeaderMissing('Strict-Transport-Security');
    }

    public function test_hsts_est_envoye_sur_une_requete_https(): void
    {
        $this->getJson('https://localhost/api/v1/auth/me')
            ->assertHeader('Strict-Transport-Security', 'max-age=31536000');
    }

    public function test_hsts_est_configurable_et_desactivable(): void
    {
        config(['security.headers.hsts.max_age' => 600, 'security.headers.hsts.include_subdomains' => true]);
        $this->getJson('https://localhost/api/v1/auth/me')
            ->assertHeader('Strict-Transport-Security', 'max-age=600; includeSubDomains');

        config(['security.headers.hsts.enabled' => false]);
        $this->getJson('https://localhost/api/v1/auth/me')->assertHeaderMissing('Strict-Transport-Security');
    }

    public function test_les_en_tetes_peuvent_etre_coupes_globalement(): void
    {
        config(['security.headers.enabled' => false]);

        $this->getJson('/api/v1/auth/me')->assertHeaderMissing('X-Frame-Options')->assertHeaderMissing('X-Content-Type-Options');
    }

    public function test_un_en_tete_deja_pose_par_l_application_n_est_pas_ecrase(): void
    {
        \Illuminate\Support\Facades\Route::get('/__test-en-tete', fn () => response('ok')->header('X-Frame-Options', 'SAMEORIGIN'));

        $this->get('/__test-en-tete')->assertHeader('X-Frame-Options', 'SAMEORIGIN')->assertHeader('X-Content-Type-Options', 'nosniff');
    }

    public function test_les_requetes_cors_du_frontend_continuent_de_fonctionner(): void
    {
        config(['cors.allowed_origins' => ['https://spa.exemple.test']]);

        $this->withHeaders(['Origin' => 'https://spa.exemple.test', 'Access-Control-Request-Method' => 'GET'])
            ->call('OPTIONS', '/api/v1/auth/me')
            ->assertSuccessful()
            ->assertHeader('Access-Control-Allow-Origin', 'https://spa.exemple.test');
    }

    // ------------------------------------------------------------------ proxys de confiance

    public function test_sans_proxy_de_confiance_l_en_tete_forwarded_proto_est_ignore(): void
    {
        // Comportement par défaut : un client ne peut pas se faire passer pour une requête HTTPS.
        $this->withHeaders(['X-Forwarded-Proto' => 'https'])->get('/')->assertHeaderMissing('Strict-Transport-Security');
    }

    public function test_avec_un_proxy_de_confiance_https_est_detecte_derriere_le_proxy(): void
    {
        config(['security.trusted_proxies' => 'REMOTE_ADDR']);

        $this->withHeaders(['X-Forwarded-Proto' => 'https'])->get('/')->assertHeader('Strict-Transport-Security', 'max-age=31536000');
    }

    public function test_un_proxy_de_confiance_precis_n_est_cru_que_depuis_son_adresse(): void
    {
        config(['security.trusted_proxies' => '10.20.30.40']);

        // L'appelant (127.0.0.1) n'est pas dans la liste : l'en-tête est ignoré.
        $this->withHeaders(['X-Forwarded-Proto' => 'https'])->get('/')->assertHeaderMissing('Strict-Transport-Security');

        config(['security.trusted_proxies' => '10.20.30.40, 127.0.0.1']);
        $this->withHeaders(['X-Forwarded-Proto' => 'https'])->get('/')->assertHeader('Strict-Transport-Security');
    }
}