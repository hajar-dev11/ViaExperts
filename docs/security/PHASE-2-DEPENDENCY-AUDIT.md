# Phase 2 — Audit des dépendances et plan d'upgrade (PHP / Laravel / Composer)

Audit en **lecture seule** : aucun `composer update/require/remove`, aucune modification de `composer.json`, `composer.lock`, `vendor/`, du code, des routes, des migrations, de la base ni du frontend
(empreintes SHA-256 de `composer.json`, `composer.lock` et `vendor/composer/installed.json` relevées avant et après : identiques).
Point de retour : tag `pre-dependency-audit` = `a2ef616` (`post-security-hardening`). Date de l'audit : 6 octobre 2026.
Sources externes consultées : politique de support Laravel (laravel.com/docs/13.x/releases), cycle de vie PHP (php.net/supported-versions), page commerciale LWS (hébergement web), métadonnées Packagist via `composer show/outdated/audit`.

## A. État actuel

| Élément | Valeur |
|---|---|
| HEAD / tag | `a2ef616` / `post-security-hardening` ; arbre propre |
| Backend | Laravel **9.52.22** (dernier patch de la branche 9), PHP local **8.0.30** (XAMPP, ZTS, Windows), Composer 2.10.3 |
| composer.json | `php ^8.0.2`, `laravel/framework ^9.19`, `laravel/sanctum ^3.0`, `laravel/tinker ^2.7`, `guzzlehttp/guzzle ^7.2` ; dev : phpunit ^9.5, collision ^6.1, spatie/laravel-ignition ^1.0, pint, sail, mockery, faker |
| composer.lock | 72 paquets de production, 39 de développement ; `platform: php ^8.0.2` ; aucun paquet marqué « abandonné » |
| Tests (référence reconfirmée) | backend **425 passés + 1 échec connu** (`ServiceChatTest::test_empty_message_is_rejected`, non corrigé) ; Vitest **81** ; **32** snapshots HTML ; lint **0 erreur / 45 avertissements** ; build **OK** |
| Frontend | Node 24.21 / npm 11.19 ; `npm audit` : 0 vulnérabilité en production (1 en dev : `source-map-js`) ; 6 mises à jour mineures/patch disponibles (vite, plugin-react, oxlint, postcss, react-router-dom, lucide-react), sans lien avec cet audit |

## B. Version PHP

**Fin de vie / support (php.net, au 06/10/2026)** : 8.0 et 8.1 sont **hors support** ; 8.2 sécurité jusqu'au 31/12/2026 ; 8.3 sécurité jusqu'au 31/12/2027 ; 8.4 jusqu'au 31/12/2028 ; 8.5 jusqu'au 31/12/2029.

- **Utilisé en local** : 8.0.30 (hors support). Le projet exige `^8.0.2`.
- **Contraintes des paquets installés** : le plancher réel est 8.0.2 (Laravel 9, Sanctum 3, Symfony 6.0). Les Symfony du lock sont figés en **6.0.x** parce que Symfony 6.1+ exige PHP ≥ 8.1 : **tant que PHP reste en 8.0, les correctifs Symfony sont inaccessibles**.
- **Compatibilité du lock actuel** (`composer why-not php X`) : PHP 8.1, 8.2, 8.3 : **aucun blocage** ; PHP 8.4 et 8.5 : un seul bloqueur, `nette/schema 1.2.5` (déclare 7.1 – 8.3, tiré par `league/config` ← `league/commonmark`), résolu par la mise à jour de ce paquet.
  Laravel 9 ne déclare pas de plafond PHP, mais **ne supporte officiellement que 8.0 – 8.2**.
- **Analyse du code** : aucune API PHP dépréciée en 8.1 – 8.3 trouvée (pas de `${var}`, `utf8_encode`, `strftime`, `FILTER_SANITIZE_STRING`, `Serializable`, `create_function`). Une seule signature à corriger pour 8.4 : paramètre nullable implicite `string $nom = null` dans `DomiciliationCaracterisationTest.php:50` (test).
  Les créations de propriétés dynamiques (dépréciées en 8.2) ne se détectent pas par recherche : elles seront révélées en exécutant la suite sous PHP 8.2/8.3.
- **Extensions nécessaires** (déduites du lock et du code) : `ctype, curl, dom, fileinfo, filter, hash, iconv, json, libxml, mbstring, openssl, pcre, PDO + pdo_mysql, session, tokenizer, xml, xmlwriter` (+ `phar` et `xmlwriter` seulement pour les outils de test). `bcmath`, `exif`, `zip` sont chargés localement mais **non exigés** ; aucune extension d'image (`gd`), `intl`, `imagick` n'est requise (aucun traitement d'image / PDF / Excel côté serveur : les PDF sont générés dans le navigateur, l'export XLS est du XML écrit à la main).
- **LWS** : la page commerciale annonce « PHP 5.6 à 8.4 », SSH et tâches cron. **Composer, la version choisie par sous-domaine et les extensions réelles ne sont pas confirmés** : à vérifier sur l'offre souscrite avant de fixer la cible.
- **Recommandation** : **PHP 8.3** comme version de travail et de production (supportée par Laravel 10, 11, 12 et 13, sécurité jusqu'à fin 2027) ; **8.4** acceptable si LWS le propose et si les tests passent (supportée par Laravel 11 à 13, sécurité jusqu'à fin 2028). Éviter 8.2 (sécurité terminée dans 3 mois).

## C. Version Laravel

| Branche | PHP | Correctifs de bugs jusqu'au | Correctifs de sécurité jusqu'au | Statut |
|---|---|---|---|---|
| 9 (actuelle, 9.52.22) | 8.0 – 8.2 | terminé | terminé (début 2024) | **fin de vie** |
| 10 (10.50.3) | 8.1 – 8.3 | 06/08/2024 | 04/02/2025 | fin de vie |
| 11 (11.57.0) | 8.2 – 8.4 | 03/09/2025 | 12/03/2026 | fin de vie |
| 12 (12.69.3) | 8.2 – 8.5 | 13/08/2026 | **24/02/2027** | sécurité seule, ~4,5 mois restants |
| 13 (13.34.0) | **8.3 – 8.5** | T3 2027 | **17/03/2028** | **branche courante** |

Paquets Laravel associés (lock) : `laravel/sanctum 3.3.3` (compatible Laravel 9 et 10 seulement), `laravel/tinker 2.11.1`, `league/flysystem 3.36.0` (déjà v3), `monolog 2.11.1`, `nesbot/carbon 2.73.0`, `symfony/* 6.0.x`, `ramsey/uuid 4.9.4`.

**Recommandation : cible Laravel 13 sur PHP 8.3 (ou 8.4)**, avec un arrêt de repli possible à Laravel 12 (sécurité jusqu'au 24/02/2027, suffisant pour une première mise en ligne mais qui imposerait une nouvelle montée dans l'année).
Les montées se font **une branche à la fois** (9 → 10 → 11 → 12 → 13), chacune validée par la suite complète et taguée, car les guides officiels ne couvrent qu'un saut à la fois. Laravel 13 est annoncé comme une montée mineure depuis la 12.

## D. Résultat `composer audit` (lock actuel)

**18 avis sur 8 paquets** : 5 hauts, 7 moyens, 5 bas, 1 non classé (doublon d'un avis haut). Aucun paquet abandonné.

## E. Paquets vulnérables

| Paquet (installé) | Avis | Gravité | Corrigé à partir de | Corrigeable sans changement majeur ? | Exposition réelle estimée pour Via Experts |
|---|---|---|---|---|---|
| `laravel/framework` 9.52.22 | CRLF dans la règle de validation `email` (GHSA-5vg9-5847-vvmq, CVE-2026-48019 ; 2 entrées) | **haute** | 12.60.0 / 13.10.0 | **non** (10 et 11 restent concernées) | modérée : la règle `email` est utilisée partout ; l'envoi du mail de réinitialisation ne part que si l'adresse existe déjà en base (une adresse piégée ne correspond à aucun compte) |
| `laravel/framework` | URL signée : confusion de chemin | moyenne | 12.61.1 / 13.12.0 | non | nulle aujourd'hui : aucune URL signée utilisée |
| `laravel/framework` | contournement de validation de fichier (CVE-2025-27515) | moyenne | 10.48.29 / 11.44.1 / 12.1.1 | oui, au passage en Laravel 10 | atténuée : les uploads utilisent désormais la règle maison `FichierAutorise` (contenu réel), pas seulement les règles `mimes`/`image` du framework |
| `laravel/framework` | XSS dans la page de débogage (CVE-2026-102279) | basse | 12.69.0 / 13.30.0 | non | nulle si `APP_DEBUG=false` (obligatoire en production) |
| `symfony/http-foundation` 6.0.20 | CVE-2025-64500 : mauvais découpage de `PATH_INFO` (contournement d'autorisation limité) | **haute** | 6.4.29 (8.1+) | oui, **si PHP ≥ 8.1** | faible : les autorisations reposent sur des middlewares de route et des contrôles de contrôleur, pas sur des règles de chemin serveur |
| `symfony/http-foundation` | CVE-2024-50345 : redirection ouverte | basse | 6.4.14 | idem | faible |
| `symfony/mime` 6.0.19 | CVE-2026-45067 : injection d'en-tête / commande SMTP par CRLF dans `Address` | **haute** | 6.4.40 | idem | modérée : même chaîne que l'avis `email` ci-dessus ; la seule adresse variable est celle d'un compte existant |
| `symfony/mime` | CVE-2026-45070 : injection d'en-tête (paramètres MIME) | moyenne | 6.4.40 | idem | faible |
| `symfony/mailer` 6.0.19 | CVE-2026-45068 : injection d'arguments dans `SendmailTransport` | moyenne | 6.4.40 | idem | nulle : transport SMTP, pas sendmail |
| `symfony/routing` 6.0.19 | CVE-2026-48784 et CVE-2026-45065 : génération d'URL (segments `../`, contournement d'exigence) | moyenne ×2 | 6.4.41 / 6.4.40 | idem | faible |
| `symfony/process` 6.0.19 | CVE-2024-51736 : détournement d'exécution **sous Windows** | haute | 6.4.14 | idem | nulle en production Linux (poste de développement Windows seulement) |
| `symfony/yaml` 6.0.19 (dev) | CVE-2026-45304, CVE-2026-45305, CVE-2026-45133 (déni de service) | basses ×3 | 6.4.40 | idem | nulle (paquet de développement, absent en production avec `--no-dev`) |
| `league/commonmark` 2.10.1 | contournement de `DisallowedRawHtml` ; déni de service quadratique (tables GFM) | moyenne + **haute** | 2.10.2 (dernière 2.10.3) | **oui, dès maintenant, même sous PHP 8.0** | faible : seul usage = gabarit Markdown des e-mails du framework (texte fixe) |

Répartition : **11 avis Symfony** (corrigeables par un changement de PHP, sans changer de Laravel), **2 avis commonmark** (corrigeables tout de suite), **5 entrées Laravel** (dont 1 corrigeable en 10.x et 4 qui exigent 12.60+ / 13.x).

## F. Paquets en fin de vie / abandonnés

- **Abandonnés (flag Packagist)** : aucun.
- **Fin de vie de fait** : `laravel/framework` 9.x, `symfony/* 6.0` (branche non maintenue depuis 2023), `monolog 2.x`, `nesbot/carbon 2.x` (maintenu mais remplacé par la 3), `nunomaduro/collision 6`, `spatie/laravel-ignition 1.x`, `phpunit 9.6` (en maintenance de sécurité seulement).
- **Retard de version moindre** : `guzzlehttp/guzzle` 7.15.5 (une 8.x existe), `laravel/tinker` 2.11 (3.x existe).

## G. Compatibilité PHP

| PHP | Lock actuel | Laravel 9 | Commentaire |
|---|---|---|---|
| 8.0 | oui | oui | hors support, Symfony bloqué en 6.0 |
| 8.1 | oui | oui (hors support PHP) | débloque Symfony 6.4 ; PHP lui-même hors support |
| 8.2 | oui | oui (maximum officiel) | sécurité PHP jusqu'au 31/12/2026 |
| 8.3 | oui (non officiel pour Laravel 9) | à valider par les tests | cible recommandée |
| 8.4 / 8.5 | bloqué par `nette/schema` (mise à jour mineure triviale) | non officiel | possible après montée de Laravel |

## H. Compatibilité Laravel (ce que chaque branche impose)

| Branche | PHP | Symfony | Carbon | Monolog | Sanctum | Outils dev |
|---|---|---|---|---|---|---|
| 9.52 | ^8.0.2 | ^6.0 | ^2.62 | ^2 | 3.x | collision 6, ignition 1.x, phpunit 9 |
| 10.50 | ^8.1 | **^6.4** | ^2.67 | **^3** | 3.x (3.3.3 OK) | collision 7, ignition 2.x, phpunit 9.6 ou 10 |
| 11.57 | ^8.2 | **^7** | 2.72.6 ou 3 | 3 | **4.x** (3.x non supporté) | collision 8, phpunit 10.5 / 11 |
| 12.69 | ^8.2 | ^7.2 | **^3.8.4 obligatoire** | 3 | 4.x | phpunit 11 |
| 13.34 | **^8.3** | ^7.4 \|\| ^8 | ^3.8.4 | ^3.10 | 4.3.3 (déclare ^13) | phpunit 11.5 / 12, collision 8.x |

Constats : Laravel 10 suffit à ramener tous les Symfony en 6.4.4x (donc à fermer les 11 avis Symfony) ; **Sanctum 3 ne passe pas la barrière Laravel 11** ; **Carbon 3 devient obligatoire avec Laravel 12** ; PHP ≥ 8.3 est requis à partir de Laravel 13.

## I. Paquets nécessitant une action

| Paquet | Version actuelle | Recommandée (cible) | Max. compatible sans changement majeur | Risque | Impact projet | Action |
|---|---|---|---|---|---|---|
| `php` (exigence) | ^8.0.2 | ^8.3 | 8.0.x | élevé (environnement) | tout le code | monter PHP en premier, sans changer Laravel |
| `laravel/framework` | 9.52.22 | 13.34.x (via 10, 11, 12) | 9.52.22 (dernier de la branche) | moyen | routes, middlewares, validation, tests | montée branche par branche |
| `laravel/sanctum` | 3.3.3 | 4.3.3 | 3.3.3 (Laravel 9 – 10) | **moyen** | authentification SPA, cookies, CSRF | passer en 4.x avec Laravel 11 ; revoir `config/sanctum.php` |
| `laravel/tinker` | 2.11.1 | 2.x ou 3.0.2 | 2.11.1 (Laravel ≤ 12) ; 3.0.2 gère aussi 13 | faible | outil console seul | déplacer en `require-dev` (non utilisé par l'application) |
| `symfony/*` (console, http-foundation, http-kernel, mailer, mime, routing, process…) | 6.0.19 – 6.0.20 | 7.4.x | 6.4.4x (exige PHP ≥ 8.1) | faible une fois PHP ≥ 8.1 | requêtes, e-mails, routage | tombent avec la montée PHP/Laravel 10 |
| `league/commonmark` | 2.10.1 | 2.10.3 | 2.10.3 (compatible PHP 8.0) | très faible | e-mails | mise à jour immédiate possible, dans les contraintes |
| `nette/schema` | 1.2.5 | 1.3.x | 1.2.5 | très faible | bloque PHP 8.4 | mise à jour avec le lot « PHP » |
| `monolog/monolog` | 2.11.1 | 3.10+ | 2.11.1 | faible | journaux (canal `single`, `stack`) | suit Laravel 10 ; aucun handler maison dans le code |
| `nesbot/carbon` | 2.73.0 | 3.8.4+ | 2.73.0 | **moyen** | dates des domiciliations, factures | obligatoire avec Laravel 12 : voir section K |
| `guzzlehttp/guzzle` | 7.15.5 | 7.15.x (rester en 7) | 7.15.5 | faible | **non utilisé dans le code** | garder en 7 ; envisager de le retirer de `require` |
| `phpunit/phpunit` | 9.6.36 | 11.5.x (Laravel 12) / 12.5.x (Laravel 13) | 9.6.38 | **moyen** | 426 tests, 3 annotations `@dataProvider` | changer par paliers ; remplacer par `#[DataProvider]` ; migrer `phpunit.xml` |
| `nunomaduro/collision` | 6.4.0 | 8.x | 6.4.0 | faible | affichage des tests | 7.x avec Laravel 10, 8.x ensuite |
| `spatie/laravel-ignition` | 1.7.2 | 2.x | 1.7.2 (Laravel 9) | faible | page d'erreur (dev) | 2.x dès Laravel 10 ; absent en production |
| `laravel/sail`, `laravel/pint`, `fakerphp/faker`, `mockery` | 1.67 / 1.5 / 1.24 / 1.6 | à jour | idem | très faible | outillage | `sail` inutile (Docker non utilisé) : retrait possible |
| `league/flysystem` | 3.36.0 | idem | idem | très faible | stockage | rien à faire |

Aucune bibliothèque serveur de PDF, d'image, d'Excel/CSV ou de permissions (`spatie/laravel-permission`) n'est installée : les permissions sont maison, les PDF sont produits côté navigateur.

## J. Risques identifiés

1. **Sanctum 3 → 4** (avec Laravel 11) : les clés `middleware` de `config/sanctum.php` ont été renommées par Sanctum 4 (`verify_csrf_token` → `validate_csrf_token`) ; notre `VerifyCsrfToken` personnalisé y est référencé. À valider contre les tests d'authentification (419, connexion SPA, CORS) ajoutés en phase 1.
2. **Carbon 2 → 3** (obligatoire avec Laravel 12) : `diffIn*()` renvoient des flottants signés. **Aucun appel `diffIn*` / `diffForHumans` / `->diff(` n'existe dans le code applicatif** ; les comparaisons (`lte`, `startOfDay`, `addDays`) de `Domiciliation` ne changent pas. Risque réduit mais à garder sous test : alertes et états d'expiration des domiciliations, fenêtre de numérotation.
3. **Squelette Laravel 11+** : ne **pas** adopter le nouveau squelette. Le projet garde `app/Http/Kernel.php`, `bootstrap/app.php` classique, `config/*.php` complets et `public/index.php` actuel (tous toujours pris en charge). En particulier, un `config/filesystems.php` régénéré changerait la racine du disque `local` (`storage/app` → `storage/app/private`) et la collation MySQL par défaut : **à ne jamais écraser** (conserver les fichiers de config actuels).
4. **Middleware** : `protected $routeMiddleware` (Kernel) est renommé `$middlewareAliases` depuis Laravel 10 ; l'ancien nom reste toléré mais à renommer. `TrustProxies` utilise la constante `HEADER_X_FORWARDED_AWS_ELB` (à vérifier avec Symfony 7/8). `VerifyCsrfToken` est remplacé par `PreventRequestForgery` dans Laravel 13 (alias conservé : à confirmer à la montée).
5. **E-mail** : l'option `encryption` de `config/mail.php` est remplacée par `scheme` dans les squelettes récents ; l'ancienne clé reste interprétée. À tester avec un vrai SMTP LWS (port 587 / 465).
6. **Tests** : PHPUnit 10/11/12 (nouveau schéma `phpunit.xml`, annotations remplacées par des attributs ; 3 `@dataProvider`) ; 426 tests à rejouer à chaque palier.
7. **Base de données** : aucune migration à modifier (aucun `->change()` ni appel Doctrine DBAL ; les modifications de colonnes sont en SQL brut, ce qui évite la dépendance à `doctrine/dbal`). Contraintes `CHECK` : MySQL ≥ 8.0.16 ou MariaDB ≥ 10.2.1 (indépendant de Laravel).
8. **Environnement Windows ↔ Linux** : le développement est sous Windows (XAMPP, PHP ZTS) ; LWS est sous Linux. Les tests de concurrence (vrais processus PHP) et les chemins de fichiers doivent être rejoués sous Linux avant la mise en production.
9. **Planning** : Laravel 12 n'a plus que ~4,5 mois de correctifs de sécurité : s'y arrêter ne règle le problème que temporairement.

## K. Code potentiellement impacté (recherche statique sur 280 fichiers PHP)

| Zone | Constat | Impact attendu |
|---|---|---|
| Carbon | 0 `diffIn*` ; `addDays`/`addMonths`/`subMonth` : 1 usage applicatif (`Domiciliation.php:130`) + tests + migrations | faible |
| Eloquent `$dates`, `dispatchNow`, `assertDeleted`, `getDoctrine`, `Schema::getColumnType` | 0 occurrence | aucun |
| Accesseurs historiques `getXAttribute` / `setXAttribute` | 12 | toujours supportés (aucune migration forcée vers `Attribute::make`) |
| Kernel `$routeMiddleware` | 1 | renommage recommandé (Laravel 10) |
| `Authenticate::redirectTo` → `route('login')` (route inexistante) | 1 | sans effet pour l'API JSON ; à surveiller |
| Validation (`Rule::`, règles `file`, `email`) | 21 + règle maison `FichierAutorise` (finfo) | faible ; couverte par 13 tests d'upload |
| Authentification / Sanctum (`Auth::attempt`, `RateLimiter`, `HasApiTokens`) | 15 + 7 | moyen (Sanctum 4) ; couvert par 23 tests d'authentification |
| Filesystem (`Storage::`, `download`, `response`) | 83 (36 app, 47 tests) | faible (Flysystem 3 déjà en place) |
| Mail / Notification | 8 (1 notification personnalisée de réinitialisation) | faible ; test SMTP réel nécessaire |
| Files d'attente / jobs / planificateur | 0 (`QUEUE_CONNECTION=sync`, `schedule()` vide) | aucun |
| API Resources | 16 | stable |
| Fabriques / seeders | 1 fabrique `UserFactory` ; seeders sans mot de passe en dur | faible |
| Providers / bootstrap | `EventServiceProvider` (`shouldDiscoverEvents`), `RouteServiceProvider`, `AuthServiceProvider`, 2 providers de module | faible ; vérifier la découverte automatique d'événements (Laravel 11) |
| Tests | 3 `@dataProvider`, `CreatesApplication`, `phpunit.xml` ancien schéma ; 1 signature `string $nom = null` | à moderniser avec PHPUnit 10+ |
| Frontend | aucun lien avec les versions PHP/Laravel (contrat JSON inchangé ; `VITE_API_URL`) | nul |

## L. Stratégie d'upgrade recommandée

Principes : **mettre à jour avant la première mise en production** (aucune donnée réelle à risque, rollback = simple retour au tag) ; un palier à la fois ; chaque palier = branche dédiée, `composer.lock` figé, suite complète verte, tag `pre-/post-`, jamais de push avant validation ; ne **jamais** toucher aux migrations ni aux données ; l'API JSON et les routes ne changent pas (les snapshots de routes, de permissions et de formes d'API servent de garde-fous).

- **PHP** : 8.0 → **8.3** (8.4 optionnel en fin de parcours). Installer PHP 8.3 en parallèle (XAMPP) sans toucher à l'installation 8.0.
- **Laravel** : 9.52 → 10.50 → 11.57 → 12.69 → **13.34**.
- **Paquets** : par groupes contrôlés (voir M), jamais un `composer update` global.
- **Rollback** : un tag par palier, la base n'est jamais migrée (aucun changement de schéma) ; en cas de problème on rebascule sur le tag précédent et sur le `vendor/` correspondant.
- **Compatibilité LWS** : cible PHP 8.3 (annoncé disponible jusqu'à 8.4) ; Composer/SSH à confirmer. Si Composer est absent sur le serveur, `vendor/` devra être construit en local (sous PHP 8.3, avec `config.platform.php` fixé) et téléversé.

## M. Ordre recommandé des upgrades

0. **Préparation (aucun changement de version)** : PHP 8.3 installé en parallèle ; rejouer la suite actuelle (Laravel 9 inchangé) sous 8.3 pour détecter les dépréciations PHP seules ; relever les avertissements.
1. **Lot 1 — PHP + dépendances dans les contraintes actuelles** : `composer.json` `php ^8.3` (+ `config.platform.php`), mise à jour **limitée** (`symfony/*`, `league/commonmark`, `nette/schema`, polyfills, `monolog` 2.x) ; Laravel reste en 9.52.22. Ferme 13 des 18 avis. Le seul point de vigilance est Symfony 6.4 sous Laravel 9.
2. **Lot 2 — Laravel 10.50** : Sanctum reste en 3.3.3 ; Monolog 3 ; collision 7 ; ignition 2 ; renommer `$routeMiddleware` ; PHPUnit 9.6 conservé. Ferme CVE-2025-27515.
3. **Lot 3 — Laravel 11.57** : Sanctum **4.x** (revoir `config/sanctum.php`, test 419 / CORS / connexion) ; collision 8 ; PHPUnit 10.5 (nouveau `phpunit.xml`) ; garder l'ancienne structure d'application.
4. **Lot 4 — Laravel 12.69** : Carbon 3 ; PHPUnit 11.5 ; remplacer les 3 `@dataProvider` par `#[DataProvider]` ; rejouer l'alerte d'expiration des domiciliations. **Ferme les 4 dernières entrées Laravel.** Point d'arrêt possible.
5. **Lot 5 — Laravel 13.34** : Symfony 7.4 ; PHPUnit 12.5 ; vérifier `PreventRequestForgery` / `VerifyCsrfToken` et `TrustProxies`.
6. **Nettoyage** : `laravel/tinker` et `guzzle` (inutilisé) hors production, retrait de `laravel/sail`, correction du paramètre nullable implicite (PHP 8.4), `composer audit` à zéro.
7. **Recette finale sous Linux** (PHP 8.3, MySQL cible) : suite complète, tests de concurrence de numérotation, envoi réel d'un e-mail de réinitialisation, parcours manuel connexion → facture → domiciliation.

## N. Risques de régression

| Palier | Probabilité | Zones sensibles | Détection |
|---|---|---|---|
| Lot 1 | faible | requêtes HTTP (Symfony 6.4), e-mail, dépréciations PHP | suite complète, snapshots |
| Lot 2 | faible à moyenne | middlewares, journaux Monolog 3, outillage de test | suite complète, test des routes publiques |
| Lot 3 | **moyenne** | **authentification SPA (Sanctum 4)**, cookies / CSRF / CORS, découverte d'événements | tests d'authentification, test 419, recette manuelle |
| Lot 4 | moyenne | dates (Carbon 3), PHPUnit 11 | tests de domiciliation, Facturation, snapshots HTML/JSON |
| Lot 5 | faible à moyenne | CSRF renommé, proxys de confiance | tests d'authentification, déploiement de préproduction |

Aucun palier ne touche aux migrations, au schéma, aux routes métier ni au frontend.

## O. Tests nécessaires après chaque palier

- Backend complet (426 tests, avec l'unique échec connu inchangé) ; snapshots de routes, permissions et formes d'API **sans modification de fichier**.
- `AuthenticationTest` (23), `AutorisationRoutesTest` (5), `UploadSecurityTest` (13), `SeedersSecurityTest` (6) : filets de sécurité de la phase 1.
- Tests de numérotation et de concurrence (vrais processus) ; tests Domiciliation (états d'expiration, alertes) et Facturation.
- Frontend : Vitest (81), 32 snapshots, lint (0 erreur), build.
- `composer audit` et `composer outdated` après chaque palier ; `php artisan about`, `route:list` (210 routes inchangées), `config:cache` + `view:cache` en simulation.
- Recette manuelle : connexion/déconnexion, mot de passe oublié avec e-mail réel, téléversement d'un PDF, génération des PDF, une facture, une domiciliation.
- Exécution sous **Linux** avant la mise en production.

## P. Recommandation finale

**Verdict : PASS — prêt pour la prochaine étape** (l'audit est terminé, sans modification). La base est suffisamment protégée par les tests pour entreprendre la montée de version, à condition de la faire par paliers et **avant** la première mise en production.

À retenir :
- **Version PHP recommandée : 8.3** (8.4 possible).
- **Version Laravel recommandée : 13.34**, en passant par 10, 11 et 12 ; palier d'arrêt acceptable : 12.69.
- **Le correctif de sécurité le plus rentable est le changement de PHP** (≥ 8.1) : il ouvre Symfony 6.4 et ferme 11 avis. Les 4 avis Laravel restants ne disparaissent qu'à partir de Laravel 12.60 / 13.
- **Prochaine étape** : « Étape 23 — Lot 0 et Lot 1 : PHP 8.3 + dépendances dans les contraintes actuelles ». Elle commence par un tag `pre-php-upgrade` et un backup de la base, et ne change ni Laravel ni le code métier.
- Décisions à prendre avant : (1) PHP 8.3 ou 8.4 selon la confirmation LWS, (2) arrêt à Laravel 12 ou poursuite jusqu'à 13, (3) Composer disponible ou non sur le serveur LWS.
