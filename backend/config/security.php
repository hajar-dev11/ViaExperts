<?php

/*
|--------------------------------------------------------------------------
| Sécurité HTTP (en-têtes, proxys de confiance)
|--------------------------------------------------------------------------
|
| Tout se règle par variables d'environnement : aucune valeur propre à un serveur ni à un domaine n'est écrite
| dans le code. Les valeurs par défaut sont sûres pour un hébergement mutualisé classique (HTTPS terminé par Apache).
| Voir docs/production/CONFIGURATION-PRODUCTION.md.
|
*/

return [

    /*
    | Proxys de confiance (TRUSTED_PROXIES)
    |
    | Vide (défaut) : aucun proxy n'est cru ; Laravel lit HTTPS / l'IP cliente directement sur la connexion. C'est le bon
    | réglage quand Apache/PHP-FPM reçoit lui-même le trafic HTTPS (cas habituel chez un hébergeur mutualisé).
    | Liste d'adresses séparées par des virgules : seuls ces proxys sont crus (réglage recommandé derrière un
    | répartiteur de charge ou un CDN dont on connaît les adresses ; « REMOTE_ADDR » désigne l'appelant direct).
    | « * » : croit l'appelant direct, quel qu'il soit. À réserver au cas où l'application n'est joignable QUE par le
    | proxy, sinon n'importe qui peut falsifier X-Forwarded-For / X-Forwarded-Proto (contournement du blocage par IP).
    */
    'trusted_proxies' => env('TRUSTED_PROXIES'),

    /*
    | En-têtes de sécurité des réponses (middleware App\Http\Middleware\SecurityHeaders)
    */
    'headers' => [
        'enabled' => (bool) env('SECURITY_HEADERS_ENABLED', true),

        // Les réponses de l'API ne sont jamais affichées dans un cadre.
        'frame_options' => env('SECURITY_FRAME_OPTIONS', 'DENY'),

        'referrer_policy' => env('SECURITY_REFERRER_POLICY', 'strict-origin-when-cross-origin'),

        // HSTS : n'est JAMAIS envoyé sur une requête en HTTP (développement local compris), uniquement sur une
        // requête HTTPS. Une fois reçu, le navigateur refuse HTTP pour ce domaine pendant `max_age` secondes :
        // n'activer qu'une fois le HTTPS définitivement en place (désactivable par SECURITY_HSTS_ENABLED=false).
        'hsts' => [
            'enabled' => (bool) env('SECURITY_HSTS_ENABLED', true),
            'max_age' => (int) env('SECURITY_HSTS_MAX_AGE', 31536000),
            'include_subdomains' => (bool) env('SECURITY_HSTS_INCLUDE_SUBDOMAINS', false),
        ],
    ],

];