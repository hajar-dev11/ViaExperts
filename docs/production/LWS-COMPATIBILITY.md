# Compatibilité LWS — points à vérifier avant le déploiement

> **Statut : liste de contrôle.** Rien de ce qui suit n'a été vérifié chez LWS : ce sont les éléments à **confirmer auprès de
> l'hébergeur ou sur le serveur** avant la mise en ligne. Cocher chaque ligne et noter la valeur constatée.

## 1. Base de données : MariaDB en local, MySQL en production

- Le projet utilise le pilote Laravel `DB_CONNECTION=mysql`. La machine de développement exécute actuellement **MariaDB 10.4.32**
  (le serveur répond `10.4.32-MariaDB` à `SELECT VERSION()`). **La base locale n'est pas remplacée** par ce travail.
- Le serveur de production visé est **MySQL** : sa **version exacte** est à obtenir de LWS. **Le test réel MariaDB → MySQL reste à
  faire** séparément, sur une instance MySQL compatible (idéalement la même version que LWS), en rejouant : migrations sur base
  vide, jeu de tests PHPUnit complet et tests de concurrence (paiements, renouvellement de domiciliation).
- Ce qui est déjà aligné sur MySQL : moteur InnoDB partout, `utf8mb4`, mode strict activé par Laravel
  (`ONLY_FULL_GROUP_BY`, `STRICT_TRANS_TABLES`… — donc les requêtes sont déjà testées sous un mode strict), clés étrangères.
- Points de vigilance connus lors du passage MariaDB → MySQL :
  - `GET_LOCK` / `RELEASE_LOCK` (verrou de création des paiements, `App\Support\VerrouPaiements`) : seule requête SQL « brute » du
    code applicatif. Disponible sur MySQL, mais **à confirmer chez LWS** (certains hébergeurs restreignent certaines fonctions).
    Si le verrou est refusé, la création de paiements répond **503** (jamais de double paiement silencieux).
  - Collations : 40 tables en `utf8mb4_unicode_ci`, 3 tables en `utf8mb4_general_ci` — MySQL 8 propose `utf8mb4_0900_ai_ci` par
    défaut : vérifier que la base de production est créée avec `utf8mb4` / `utf8mb4_unicode_ci` pour éviter des comparaisons
    de collations mixtes.
  - Différences de syntaxe/typage : aucune requête spécifique MariaDB n'a été relevée dans le code, mais seul un test sur MySQL le
    confirme.
  - Index absents mais sans conséquence actuelle : `documents_commerciaux.date_document`, `paiements.date_operation` (à créer
    seulement si les listes ralentissent, par une migration dédiée).

## 2. Liste de contrôle

| # | Élément | Pourquoi | Comment vérifier | Valeur constatée |
|---|---|---|---|---|
| 1 | **Version MySQL exacte** (et moteur : MySQL ou MariaDB) | Test de compatibilité ci-dessus | `SELECT VERSION();` | ☐ |
| 2 | **PHP 8.3** (minimum requis par le projet : 8.2) | Laravel 12 | `php -v`, sélecteur de version du panneau LWS | ☐ |
| 3 | `pdo_mysql` | Accès à la base | `php -m \| grep pdo_mysql` | ☐ |
| 4 | `fileinfo` | Contrôle du type réel des fichiers téléversés | `php -m \| grep fileinfo` | ☐ |
| 5 | `mbstring`, `openssl`, `tokenizer`, `ctype`, `json`, `dom`, `xml`, `libxml`, `iconv`, `session` | Prérequis Laravel/Composer | `php artisan about` ou `composer check-platform-reqs --no-dev` | ☐ |
| 6 | `gd` | Traitement d'images (le projet ne génère pas de PDF côté serveur ; à confirmer si une fonction l'exige) | `php -m \| grep gd` | ☐ |
| 7 | **`mod_rewrite`** (Apache) + `AllowOverride All` | `public/.htaccess` (routage Laravel, refus d'exécution dans `/storage`) | une URL d'API inconnue renvoie le JSON 404 de Laravel et non une page Apache | ☐ |
| 8 | **Document root = `backend/public`** | Sinon `.env`, `vendor/`, `storage/` seraient exposés | `curl -I https://api…/.env` → 404 | ☐ |
| 9 | **HTTPS** + certificat valide, redirection HTTP → HTTPS | Cookies `Secure`, HSTS | navigateur, `curl -I http://…` | ☐ |
| 10 | **Lien symbolique** `public/storage` (`storage:link`) | Affichage des fichiers téléversés ; sinon prévoir une alternative (voir `UPLOADS-ANALYSE.md`) | `php artisan storage:link` ou test d'une URL `/storage/…` | ☐ |
| 11 | `GET_LOCK` autorisé | Verrou de création des paiements | `SELECT GET_LOCK('test',1), RELEASE_LOCK('test');` → `1` | ☐ |
| 12 | **Limites d'envoi** : `upload_max_filesize`, `post_max_size` ≥ 6 Mo (pièces jointes de 5 Mo), `memory_limit` ≥ 256 Mo, `max_execution_time` | Pièces jointes, rapports | `php -i \| grep -E "upload_max|post_max|memory_limit"` | ☐ |
| 13 | **SMTP** : serveur, port, chiffrement, identifiants ; SPF/DKIM du domaine expéditeur ; quota d'envoi | « Mot de passe oublié » | envoi réel d'un lien de réinitialisation | ☐ |
| 14 | **Cron / tâches planifiées** | Sauvegardes ; le projet n'a pas de tâche planifiée Laravel (`schedule` vide) | panneau LWS | ☐ |
| 15 | **Sauvegardes de l'hébergeur** (base + fichiers) : fréquence, rétention, restauration en libre-service | Complète — ne remplace pas — `BACKUP-ROLLBACK.md` | panneau/documentation LWS | ☐ |
| 16 | **Fuseau horaire** du serveur / de PHP | L'application force `Africa/Casablanca` | `php -r "echo date_default_timezone_get();"` (informatif) | ☐ |
| 17 | **Expose PHP** : `expose_php=Off` | Masque `X-Powered-By: PHP/x.y` | `curl -I https://api…/` | ☐ |
| 18 | **Accès SSH / Composer / `php artisan`** | Déploiement et `production:verifier` ; sinon déploiement par archive (vendor inclus) | panneau LWS | ☐ |
| 19 | **Sous-domaines** `app.` et `api.` sur le même domaine racine | Cookie de session `SameSite=Lax` | DNS / panneau | ☐ |
| 20 | **Proxy / CDN** devant l'application ? | Réglage de `TRUSTED_PROXIES` | documentation LWS | ☐ |

## 3. Ordre conseillé

1. Obtenir de LWS : version MySQL, version PHP et extensions, accès SSH, possibilité de lien symbolique, `GET_LOCK`, SMTP.
2. Monter une **instance MySQL de même version** et rejouer migrations + PHPUnit + concurrence (test MariaDB → MySQL).
3. Créer la pré-production LWS, y exécuter [`BACKUP-ROLLBACK.md`](BACKUP-ROLLBACK.md) à blanc (sauvegarde, déploiement, restauration).
4. Configurer le `.env` ([`CONFIGURATION-PRODUCTION.md`](CONFIGURATION-PRODUCTION.md)), lancer `php artisan production:verifier`.
5. Seulement ensuite : déploiement de production.
