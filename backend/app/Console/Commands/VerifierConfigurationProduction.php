<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * `php artisan production:verifier` — contrôle EN LECTURE SEULE de la configuration avant (et après) une mise en production.
 *
 * N'écrit rien (ni fichier, ni base) et n'affiche jamais de secret : seules les NOMS de variables et des verdicts sont
 * imprimés. Code de sortie 1 si au moins un point bloquant (✗) est trouvé, 0 sinon (les avertissements ! n'échouent pas).
 * À lancer sur le serveur, avec le vrai .env, juste après le déploiement. Voir docs/production/CONFIGURATION-PRODUCTION.md.
 */
class VerifierConfigurationProduction extends Command
{
    protected $signature = 'production:verifier {--sans-base : Ne teste pas la connexion à la base de données}';

    protected $description = 'Vérifie (lecture seule) que la configuration est prête pour la production';

    /** @var array<int, array{0: string, 1: string, 2: string}> */
    private array $resultats = [];

    public function handle(): int
    {
        $this->verifierApplication();
        $this->verifierUrls();
        $this->verifierSession();
        $this->verifierCourriel();
        $this->verifierSecurite();
        $this->verifierDeploiement();

        if (! $this->option('sans-base')) {
            $this->verifierBaseDeDonnees();
        }

        $bloquants = 0;
        $avertissements = 0;
        foreach ($this->resultats as [$niveau, $titre, $detail]) {
            [$symbole, $methode] = match ($niveau) {
                'ok' => ['✓', 'info'],
                'avertissement' => ['!', 'warn'],
                default => ['✗', 'error'],
            };
            $niveau === 'ok' ? null : ($niveau === 'avertissement' ? $avertissements++ : $bloquants++);
            $this->{$methode}("{$symbole} {$titre}".($detail !== '' ? " — {$detail}" : ''));
        }

        $this->newLine();
        $this->line("Bloquants : {$bloquants} — Avertissements : {$avertissements}");

        return $bloquants > 0 ? self::FAILURE : self::SUCCESS;
    }

    private function ok(string $titre, string $detail = ''): void
    {
        $this->resultats[] = ['ok', $titre, $detail];
    }

    private function avertir(string $titre, string $detail = ''): void
    {
        $this->resultats[] = ['avertissement', $titre, $detail];
    }

    private function bloquer(string $titre, string $detail = ''): void
    {
        $this->resultats[] = ['bloquant', $titre, $detail];
    }

    private function verifier(bool $condition, string $titre, string $detailSiKo, string $niveauSiKo = 'bloquant'): void
    {
        $condition ? $this->ok($titre) : ($niveauSiKo === 'bloquant' ? $this->bloquer($titre, $detailSiKo) : $this->avertir($titre, $detailSiKo));
    }

    /** Vrai pour un hôte qui ne peut pas être un domaine public de production (local, réseau interne, IP littérale). */
    private function estLocal(string $url): bool
    {
        $hote = strtolower(trim((string) parse_url($url, PHP_URL_HOST), '[]'));

        if ($hote === '' || in_array($hote, ['localhost', '::1'], true)) {
            return true;
        }

        if (preg_match('/\.(test|local|localhost|localdomain|internal|lan)$/', $hote)) {
            return true;
        }

        return filter_var($hote, FILTER_VALIDATE_IP) !== false;
    }

    private function verifierApplication(): void
    {
        $this->verifier(config('app.env') === 'production', 'APP_ENV = production', 'APP_ENV vaut « '.config('app.env').' »');
        $this->verifier(config('app.debug') === false, 'APP_DEBUG = false', 'APP_DEBUG est actif : les erreurs détaillées seraient visibles par les visiteurs');
        $this->verifier((string) config('app.key') !== '', 'APP_KEY défini', 'APP_KEY est vide : php artisan key:generate (UNE seule fois, jamais en production existante)');
        $this->verifier(config('app.timezone') === 'Africa/Casablanca', 'Fuseau horaire Africa/Casablanca', 'fuseau « '.config('app.timezone').' »', 'avertissement');
        $this->verifier(! in_array(strtolower((string) env('LOG_LEVEL', 'debug')), ['debug'], true), 'LOG_LEVEL ≠ debug', 'LOG_LEVEL=debug écrit énormément dans les journaux (et peut y laisser des données)', 'avertissement');
    }

    private function verifierUrls(): void
    {
        $app = (string) config('app.url');
        $front = (string) config('app.frontend_url');

        $this->verifier(str_starts_with($app, 'https://') && ! $this->estLocal($app), 'APP_URL en HTTPS sur un vrai domaine', 'APP_URL doit être l\'URL publique HTTPS de l\'API');
        $this->verifier(str_starts_with($front, 'https://') && ! $this->estLocal($front), 'FRONTEND_URL en HTTPS sur un vrai domaine', 'FRONTEND_URL doit être l\'URL publique HTTPS du site (origine autorisée par CORS et lien des emails)');
        $this->verifier(! preg_match('#^https?://[^/]+/.+#', $front), 'FRONTEND_URL sans chemin', 'FRONTEND_URL doit être une origine (https://domaine), sans chemin : CORS la compare telle quelle');
        $this->verifier(! str_ends_with($front, '/'), 'FRONTEND_URL sans « / » final', 'retirez le « / » final : CORS compare l\'origine exacte', 'avertissement');

        $origines = (array) config('cors.allowed_origins');
        $this->verifier(
            count(array_filter($origines, fn ($o) => $this->estLocal((string) $o))) === 0,
            'CORS : aucune origine locale autorisée',
            'origines locales autorisées : '.implode(', ', array_filter($origines, fn ($o) => $this->estLocal((string) $o)))
        );
    }

    private function verifierSession(): void
    {
        $this->verifier(config('session.secure') === true, 'Cookies de session « Secure » (SESSION_SECURE_COOKIE)', 'à mettre à true : le cookie ne doit voyager qu\'en HTTPS');
        $this->verifier(config('session.http_only') === true, 'Cookies de session HttpOnly', '');
        $this->verifier(in_array(strtolower((string) config('session.same_site')), ['lax', 'strict'], true), 'Cookies SameSite lax/strict', 'SameSite=none expose aux requêtes intersites');

        $stateful = (array) config('sanctum.stateful');
        $locaux = array_filter($stateful, fn ($d) => preg_match('/^(localhost|127\.0\.0\.1|::1)(:\d+)?$/', trim((string) $d)));
        $this->verifier($stateful !== [] && count($locaux) === 0, 'SANCTUM_STATEFUL_DOMAINS : domaine(s) de production uniquement', $stateful === [] ? 'liste vide : la connexion du site ne fonctionnera pas' : 'domaines locaux encore présents : '.implode(', ', $locaux));

        $domaine = config('session.domain');
        $this->verifier($domaine !== null && $domaine !== '' && $domaine !== 'localhost', 'SESSION_DOMAIN défini', 'si le site et l\'API sont sur des sous-domaines d\'un même domaine (app. / api.), mettre « .votre-domaine » ; ignoré seulement si tout est sur le même hôte', 'avertissement');
        $this->verifier(in_array(config('session.driver'), ['file', 'database', 'redis', 'cookie'], true) && config('session.driver') !== 'array', 'Pilote de session persistant', 'le pilote « array » ne conserve aucune session');
    }

    private function verifierCourriel(): void
    {
        $defaut = (string) config('mail.default');
        $this->verifier(! in_array($defaut, ['log', 'array', 'null'], true), 'MAIL_MAILER envoie réellement les emails', "MAIL_MAILER={$defaut} : « mot de passe oublié » n'enverrait aucun email");

        $hote = strtolower((string) config('mail.mailers.smtp.host'));
        if ($defaut === 'smtp') {
            $this->verifier(! in_array($hote, ['', 'mailpit', 'mailhog', 'localhost', '127.0.0.1', 'smtp.mailtrap.io', 'sandbox.smtp.mailtrap.io'], true), 'MAIL_HOST est un vrai serveur SMTP', "MAIL_HOST « {$hote} » est un serveur de développement");
        }

        $from = strtolower((string) config('mail.from.address'));
        $this->verifier($from !== '' && ! str_ends_with($from, '@example.com') && ! str_ends_with($from, '.test'), 'MAIL_FROM_ADDRESS réel', 'adresse d\'expédition d\'exemple : les emails seraient rejetés ou classés indésirables', 'avertissement');
    }

    private function verifierSecurite(): void
    {
        $proxies = trim((string) config('security.trusted_proxies'));
        $this->verifier($proxies !== '*' && $proxies !== '**', 'TRUSTED_PROXIES ≠ « * »', '« * » croit n\'importe quel appelant : à réserver au cas où l\'application n\'est joignable que par le proxy', 'avertissement');
        $this->verifier((bool) config('security.headers.enabled'), 'En-têtes de sécurité activés', 'SECURITY_HEADERS_ENABLED=false');
        $this->verifier((bool) config('security.headers.hsts.enabled'), 'HSTS activé (envoyé seulement en HTTPS)', 'SECURITY_HSTS_ENABLED=false', 'avertissement');

        $this->verifier(
            ! (config('app.bootstrap_admin.email') || config('app.bootstrap_admin.password')),
            'BOOTSTRAP_ADMIN_* retirés du .env',
            'BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD sont encore définis : à retirer une fois le premier administrateur créé'
        );
    }

    private function verifierDeploiement(): void
    {
        $this->verifier(
            ! class_exists(\Spatie\LaravelIgnition\IgnitionServiceProvider::class) && ! class_exists(\PHPUnit\Framework\TestCase::class),
            'Dépendances de développement absentes',
            'composer install --no-dev --optimize-autoloader (sinon des routes de debug comme /_ignition peuvent exister)'
        );
        $this->verifier(app()->configurationIsCached(), 'Configuration en cache (config:cache)', 'php artisan config:cache', 'avertissement');
        $this->verifier(app()->routesAreCached(), 'Routes en cache (route:cache)', 'php artisan route:cache', 'avertissement');
        $this->verifier(file_exists(public_path('storage')), 'Lien public/storage présent', 'php artisan storage:link (ou lien symbolique équivalent chez l\'hébergeur)');
        $this->verifier(is_writable(storage_path()) && is_writable(base_path('bootstrap/cache')), 'storage/ et bootstrap/cache accessibles en écriture', 'droits d\'écriture manquants');
        $this->verifier(! file_exists(public_path('.env')) && ! file_exists(public_path('composer.json')), 'Aucun fichier sensible dans public/', 'le dossier public/ contient un fichier sensible');
    }

    private function verifierBaseDeDonnees(): void
    {
        try {
            $version = (string) (DB::selectOne('select version() as v')->v ?? '');
            $this->ok('Connexion à la base de données', 'serveur : '.$version);

            $verrou = DB::selectOne("select get_lock('via_experts.verification', 1) as r");
            DB::select("select release_lock('via_experts.verification')");
            $this->verifier((int) ($verrou->r ?? 0) === 1, 'GET_LOCK disponible (verrou des paiements)', 'GET_LOCK refusé : la création de paiements répondrait 503');

            $this->verifier(DB::table('migrations')->count() > 0, 'Migrations appliquées', 'aucune migration enregistrée : php artisan migrate --force');
            $this->verifier(DB::table('users')->where('is_admin', true)->exists(), 'Au moins un administrateur existe', 'aucun administrateur : définir BOOTSTRAP_ADMIN_* puis php artisan db:seed --force');
        } catch (Throwable $e) {
            $this->bloquer('Connexion à la base de données', 'impossible de se connecter ('.$e::class.')');
        }
    }
}