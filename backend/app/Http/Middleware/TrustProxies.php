<?php

namespace App\Http\Middleware;

use Illuminate\Http\Middleware\TrustProxies as Middleware;
use Illuminate\Http\Request;

class TrustProxies extends Middleware
{
    /**
     * The trusted proxies for this application.
     *
     * @var array<int, string>|string|null
     */
    protected $proxies;

    /**
     * Proxys de confiance : lus dans config/security.php (variable TRUSTED_PROXIES), jamais écrits en dur.
     * Vide = aucun proxy n'est cru (comportement historique).
     */
    protected function proxies()
    {
        $valeur = config('security.trusted_proxies');

        return is_string($valeur) && trim($valeur) !== '' ? trim($valeur) : parent::proxies();
    }

    /**
     * The headers that should be used to detect proxies.
     *
     * @var int
     */
    protected $headers =
        Request::HEADER_X_FORWARDED_FOR |
        Request::HEADER_X_FORWARDED_HOST |
        Request::HEADER_X_FORWARDED_PORT |
        Request::HEADER_X_FORWARDED_PROTO |
        Request::HEADER_X_FORWARDED_AWS_ELB;
}
