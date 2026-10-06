# Phase 1 — Security hardening

Tag de départ : `pre-security-hardening` (= `090cfa1`). Tag d'arrivée : `post-security-hardening`.
Aucune migration, aucune modification de la structure de la base, aucune route ajoutée ou retirée (le snapshot de routes est inchangé), aucun changement de design.
Aucun secret n'est reproduit dans ce document.

## 1. Compte administrateur initial (DatabaseSeeder)

- **Avant** : `DatabaseSeeder` créait un administrateur avec un e-mail et un mot de passe écrits en clair (versionnés depuis le premier commit).
- **Après** : plus aucun identifiant ni mot de passe dans le code. Le premier administrateur n'est créé que si `BOOTSTRAP_ADMIN_EMAIL` et `BOOTSTRAP_ADMIN_PASSWORD`
  (12 caractères minimum) sont définis dans le `.env` ; ils sont lus via `config/app.php` (`app.bootstrap_admin`), donc compatibles avec `config:cache`.
  Sans ces variables, rien n'est créé (avertissement) et `PermissionSeeder` s'exécute quand même. Un compte déjà existant garde son mot de passe (il est seulement promu administrateur, comme avant).
  Retirez les variables du `.env` après usage.
- **`DemoDataSeeder`** : refuse de s'exécuter en production (`RuntimeException`) ; le mot de passe des comptes de démonstration n'est plus une constante, il est généré à chaque exécution et affiché une seule fois dans la console.
  `DemoDataPurgeSeeder` et `ServiceCatalogueSeeder` ne créent aucun compte. Aucun seeder n'a été exécuté.
- **Le secret historique doit être considéré comme compromis** : il apparaît dans le premier commit (`fda5dd7`), présent sur `origin/main` (donc déjà poussé sur GitHub). L'historique n'a pas été réécrit.
  **Action manuelle requise** : changer le mot de passe de ce compte sur tous les environnements où il a servi (y compris la base locale). Ne pas réutiliser l'ancienne valeur.
- À la mise en production d'une base neuve : définir `BOOTSTRAP_ADMIN_*`, lancer `php artisan db:seed --class=DatabaseSeeder --force`, puis retirer les variables.
  (`PASSATION_CLAUDE.md` décrit encore l'ancien mécanisme : il est périmé sur ce point.)

## 2. Téléversements de fichiers

### 2.1 Inventaire (avant → après)

| Contrôleur | Endpoint (champ) | Taille max | Destination (disque `public`) | Avant | Après |
|---|---|---|---|---|---|
| `FichierController` | `POST /fichiers` (`fichiers[]`) | 20 Mo | `fichiers/` | `file` | `file` + liste blanche **documents + archives** |
| `EntrepriseController` | `POST /entreprises/{e}/documents` (`fichier`) | 5 Mo | `entreprises/` | `file` | liste blanche documents |
| `EntrepriseController` | `POST /entreprises/{e}/observations` (`fichiers[]`) | 5 Mo | `entreprises/observations/` | `file` | liste blanche documents |
| `ChatController` | `POST /chat/{u}/messages` (`fichier`) | 20 Mo | `chat/` | `file` | liste blanche documents |
| `RapportController` | `POST /rapports`, `POST /rapports/{r}` (`document`) | 20 Mo | `rapports/` | `file` | liste blanche documents + archives |
| `PaiementController` | `POST /paiements`, `POST /paiements/{p}` (`piece_jointe`) | 5 Mo | `paiements/` | `file` | liste blanche documents |
| `CachetController` | `POST /cachets/{c}/operations` (`fichier`) | 5 Mo | `cachets/` | `file` | liste blanche documents |
| `MailController` | `POST /mails/{m}/operations` (`fichier`) | 5 Mo | `mails/` | `file` | liste blanche documents |
| `ServiceEnCoursController` | `POST /services-en-cours/{s}/operations` (`fichier`) | 5 Mo | `services-en-cours/` | `file` | liste blanche documents |
| `DomiciliationController` (module) | actions (déclarer, activer, renouveler, résilier), observations, documents (`fichier`) | 5 Mo | `domiciliations/…` | `file` | liste blanche documents |
| `Cabinet/DomiciliationSettingController`, `ProfileController` | logos, signatures, photo (`file`) | 800 Ko | `settings/…`, `profiles/` | `image` + `mimes:jpg,jpeg,png,gif` (contenu réel) | **inchangé** (déjà conforme) |

### 2.2 Règle `App\Rules\FichierAutorise`

- **Extension** déclarée dans la liste blanche : pdf, jpg, jpeg, png, gif, webp, doc, docx, xls, xlsx, ppt, pptx, odt, ods, odp, txt, csv, rtf ; en plus zip, rar, 7z pour **Rapports et Fichiers** uniquement
  (besoin métier démontré par les tests existants de Rapports qui téléversent des `.zip` / `.rar`). Les autres endpoints refusent les archives.
- **Contenu réel** : le type MIME détecté par `finfo` doit correspondre à l'extension (un script PHP renommé `.pdf` ou `.png` est refusé ; un fichier vide est accepté).
- **Nom** : caractères de contrôle et octet nul refusés ; toute extension exécutable intermédiaire est refusée (`shell.php.jpg`, `a.phtml.pdf`…). Jamais autorisés : php*, phtml, phar, cgi, pl, py, sh, exe, js, html, svg, jsp, asp(x)…
- **Chemins** : le nom de stockage est généré par Laravel (40 caractères aléatoires + extension déduite du contenu) ; le nom donné par l'utilisateur n'est qu'une étiquette d'affichage (Symfony n'en garde que le nom de base). Pas de traversée de chemin ni d'écrasement possible. Les références existantes ne sont pas modifiées.
- Un test d'architecture (`UploadSecurityTest`) échoue si un contrôleur stocke un fichier sur le disque public sans cette règle (ou sans `mimes:`).

### 2.3 Aucune exécution depuis le stockage public

Défense en profondeur, indépendante du fonctionnement de PHP sur le serveur :
1. `backend/public/.htaccess` : règle `RewriteRule ^storage/…` qui renvoie **403** pour toute URL de `/storage` contenant une extension exécutable (`a.php`, `a.php.jpg`, `a.phtml/x`…), évaluée avant la réécriture vers `index.php`.
2. `backend/storage/app/public/.htaccess` (désormais versionné ; exception ajoutée au `.gitignore` du dossier) : `php_flag engine off`, `RemoveHandler`/`RemoveType`, `FilesMatch … Require all denied` (valable avec mod_php, FastCGI et php-fpm), `Options -Indexes`, `X-Content-Type-Options: nosniff`.
3. Validation à l'upload (§2.2) : un fichier exécutable n'est jamais stocké.

**À configurer / vérifier côté LWS** (un `.htaccess` n'est pas une garantie suffisante à lui seul) :
- Le document root du sous-domaine API doit être `backend/public` ; ni `.env`, ni `vendor/`, ni `storage/` (hors `storage/app/public` via le lien) ne doivent être joignables par HTTP.
- `AllowOverride` doit autoriser `.htaccess` (`FileInfo`, `Options`, `Limit`, `AuthConfig`). Sinon la règle n'est pas appliquée : **demander à LWS** de désactiver l'exécution PHP dans le dossier des uploads ou, mieux, de servir `storage` depuis un dossier sans gestionnaire PHP.
- Après le déploiement, tester : un fichier `test.php` déposé dans `storage/app/public/` doit répondre **403**, jamais exécuter du code. Supprimer ce fichier ensuite.
- Si les liens symboliques sont interdits, `php artisan storage:link` échouera : prévoir une alternative avec LWS (sans exposer d'autres dossiers).
- Vérifier `upload_max_filesize` et `post_max_size` ≥ 25 Mo.

### 2.4 Fichiers sensibles — constat (non corrigé volontairement)

Le frontend ouvre la plupart des pièces jointes par **URL publique directe** `…/storage/<chemin>` : Fichiers, chat, cachets, courriers, services en cours, pièces jointes de paiements, documents de domiciliation, logos et signatures (aussi utilisés pour générer les PDF).
Les noms sont aléatoires (non devinables) et les chemins ne sont exposés qu'aux utilisateurs autorisés par l'API, mais **toute personne qui connaît l'URL peut lire le fichier sans être connectée**.
Seuls les documents d'entreprise, les pièces d'observations (privées incluses), les justificatifs d'actions de domiciliation et les rapports passent déjà par des routes de téléchargement authentifiées et autorisées.

La correction complète (disque privé + routes authentifiées + changement des liens et de la génération de PDF côté frontend + déplacement des fichiers existants) modifie des URLs et des données existantes : **étape séparée à planifier**, avec sauvegarde préalable. Ne rien déplacer sans cela.

## 3. Autorisations des routes `auth:sanctum`

Audit de chaque contrôleur concerné (Cachets, Rapports, Chat, Notes, Fichiers, Mails, Déclarations, Paiements, Facturation, Mouvement, Profil, Archive, réglages) :

| Domaine | Contrôle | Constat |
|---|---|---|
| Cachets, Rapports, Mails, Déclarations, Paiements, Facturation, Mouvement, Chat | permission vérifiée dans **chaque** méthode du contrôleur (`hasPermission`) | conforme ; les données sont celles du cabinet (pas de propriété par utilisateur) |
| Chat | conversation filtrée sur l'utilisateur connecté ; modifier / supprimer = auteur du message uniquement | conforme (test de cloisonnement ajouté) |
| Observations privées (entreprises, domiciliations) | visibles par l'auteur et les administrateurs ; pièces jointes suivent l'observation ; appartenance de l'observation à la fiche vérifiée | conforme |
| Téléchargements imbriqués | appartenance du fichier à la ressource parente vérifiée (404 sinon) | conforme |
| `GET /settings/fichier` | chemin borné par expression régulière aux images de paramétrage (`settings/cabinet|domiciliation`) | conforme (test ajouté) |
| Routes sans authentification | seulement login, mot de passe oublié, réinitialisation | verrouillé par un test qui parcourt toutes les routes de l'API (401 attendu) |
| **Notes** et **Fichiers** (Topbar) | aucune permission, aucune vérification d'auteur : tout utilisateur connecté peut lire, modifier ou supprimer **toutes** les notes et **tous** les fichiers | **non modifié** : ces espaces sont partagés par conception et le catalogue de permissions ne les prévoit pas ; restreindre modification / suppression à l'auteur ou à un administrateur est une décision métier à valider |
| `GET /archive/counts` | seulement des compteurs, pour tout utilisateur connecté | risque faible, non modifié |

Aucune vulnérabilité de type IDOR n'a été trouvée nécessitant une correction ; aucune permission métier n'a été modifiée.

## 4. Limitation du débit de connexion

`AuthController::login` : les **échecs** sont comptés (un succès remet le compteur à zéro) avec deux compteurs, sans verrouiller le compte lui-même :
- identifiant (normalisé en minuscules) + adresse IP : **5 échecs par minute** ;
- adresse IP seule : **30 échecs par minute** (bureaux derrière une même adresse).
Au-delà : **HTTP 429**, en-tête `Retry-After`, `message` et `errors.email` explicites (même le bon mot de passe est refusé pendant la fenêtre). Le blocage expire après 60 secondes. Un autre compte depuis la même IP n'est pas bloqué.
La limitation est dans le contrôleur (pas dans le middleware de route) pour ne pas modifier les routes ni le snapshot de routes. `forgot-password` et `reset-password` gardaient déjà `throttle:6,1`.
Frontend : `Login.jsx` affiche le message du serveur pour un 429 (au lieu de « Impossible de contacter le serveur »).

Point d'exploitation : en production derrière un proxy ou un CDN, configurer `TrustProxies` pour que l'IP réelle du client soit utilisée (sinon tous les utilisateurs partagent la même IP et le seuil par IP s'applique à tous).
Constat de test : une connexion SPA qui n'arrive pas depuis un domaine déclaré dans `SANCTUM_STATEFUL_DOMAINS` (en-tête `Origin`/`Referer`) provoque une erreur 500 « Session store not set » : vérifier cette variable au déploiement.

## 5. Tests ajoutés (47)

| Fichier | Tests | Couvre |
|---|---|---|
| `SeedersSecurityTest` | 6 | seeder sans secret, bootstrap par environnement, garde-fou production du jeu de démonstration, absence de mot de passe littéral |
| `UploadSecurityTest` | 13 | liste blanche (extension, contenu réel, double extension, noms), endpoints réels, scan d'architecture des contrôleurs, protections Apache |
| `AutorisationRoutesTest` | 5 | 401 sur toutes les routes de l'API hors login/reset, 403 sans permission, gestion des utilisateurs réservée aux administrateurs, cloisonnement du chat, borne de `/settings/fichier` |
| `AuthenticationTest` | 23 | connexion, échecs, force brute (seuils, 429, expiration, remise à zéro, casse, IP), déconnexion, mot de passe oublié (neutralité, jeton, débit, lien), réinitialisation (jeton valide, invalide, expiré, mauvais e-mail, nouveau mot de passe), CSRF / session / CORS |

Mutations vérifiées : suppression du comptage des échecs → 4 tests échouent ; règle d'upload qui accepte tout → 8 échecs ; route publique ajoutée → le test de parcours échoue.

## 6. Git et secrets

- Recherche dans les fichiers suivis (clés privées, jetons AWS / GitHub / Slack / Stripe / Google, affectations de mots de passe, secrets) : **aucun secret trouvé** hors fixtures de test (utilisateurs factices) ; `.env.example` ne contient aucune valeur sensible.
- `.gitignore` racine complété : `*.sql`, `*.sql.gz`, `*.dump`, `*.bak`, `*.backup`, `backups/`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.crt`, `*.csr`, `*.log`, `.phpunit.result.cache` (aucun fichier suivi n'est concerné).
  Déjà ignorés : `.env`, `.env.*` (sauf `.example`), `vendor/`, `node_modules/`, `dist/` (le workflow actuel ne versionne pas `dist` ; le build se fait avant déploiement), `storage/logs`, uploads.
- Le dépôt GitHub `hajar-dev11/ViaExperts` répond **404 à une requête anonyme** (privé ou inexistant) : il ne semble pas public. À vérifier dans les paramètres GitHub ; s'il était public, ce serait **bloquant** (secret historique exposé). Rien n'a été modifié côté GitHub.
- Fichiers suivis à nettoyer plus tard (non traité ici) : `composer.phar`, notes de passation.

## 7. Non traité volontairement

- Montée de version Laravel / PHP (Laravel 9 et PHP 8.0 en fin de vie) : hors périmètre ; les avis `composer audit` restent ouverts (mise à jour des paquets Symfony dans les contraintes actuelles à faire dans une étape dédiée, avec tests).
- Stockage privé des pièces jointes (§2.4).
- Ownership des Notes et Fichiers (§3).
- Réécriture de l'historique Git (secret du premier commit) : non effectuée, rotation du mot de passe requise à la place.
- Configuration LWS (document root, `AllowOverride`, PHP, liens symboliques, proxy) : documentée, non vérifiable depuis ce poste.
