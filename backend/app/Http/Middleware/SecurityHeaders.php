<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * En-têtes de sécurité de toutes les réponses de l'API (réglables dans config/security.php).
 *
 *   - X-Content-Type-Options: nosniff        : le navigateur ne « devine » pas le type d'un fichier servi.
 *   - X-Frame-Options                         : l'API n'est jamais affichée dans un cadre (anti-clickjacking).
 *   - Referrer-Policy                         : n'envoie pas l'adresse complète aux sites tiers.
 *   - Strict-Transport-Security (HTTPS seul)  : impose HTTPS au navigateur ; jamais émis sur une requête HTTP.
 *
 * Aucune politique CSP ici : les réponses de l'API sont du JSON ou des fichiers (PDF, images) que le lecteur du
 * navigateur doit pouvoir afficher ; une CSP stricte pourrait bloquer ce lecteur. La CSP du FRONTEND est étudiée à
 * part (docs/production/CONFIGURATION-PRODUCTION.md). Un en-tête déjà posé par un contrôleur n'est jamais écrasé.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next)
    {
        /** @var Response $response */
        $response = $next($request);

        $config = config('security.headers');
        if (! ($config['enabled'] ?? true)) {
            return $response;
        }

        $this->poser($response, 'X-Content-Type-Options', 'nosniff');

        if (! empty($config['frame_options'])) {
            $this->poser($response, 'X-Frame-Options', (string) $config['frame_options']);
        }

        if (! empty($config['referrer_policy'])) {
            $this->poser($response, 'Referrer-Policy', (string) $config['referrer_policy']);
        }

        $hsts = $config['hsts'] ?? [];
        if (($hsts['enabled'] ?? false) && $request->isSecure() && (int) ($hsts['max_age'] ?? 0) > 0) {
            $this->poser(
                $response,
                'Strict-Transport-Security',
                'max-age='.(int) $hsts['max_age'].(($hsts['include_subdomains'] ?? false) ? '; includeSubDomains' : '')
            );
        }

        return $response;
    }

    private function poser(Response $response, string $nom, string $valeur): void
    {
        if (! $response->headers->has($nom)) {
            $response->headers->set($nom, $valeur);
        }
    }
}