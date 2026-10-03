<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    // Les ports de secours (5174/5180) ne servent qu'en local, quand plusieurs
    // instances Vite tournent en parallèle sur cette machine : ils ne doivent
    // jamais rester autorisés une fois déployé (APP_ENV autre que "local").
    'allowed_origins' => array_values(array_filter(array_merge(
        [env('FRONTEND_URL', 'http://localhost:5173')],
        env('APP_ENV', 'production') === 'local' ? ['http://localhost:5180', 'http://localhost:5174'] : []
    ))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,

];
