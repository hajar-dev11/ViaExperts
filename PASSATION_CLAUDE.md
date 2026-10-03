# PASSATION_CLAUDE.md — Document de reprise du projet « Via Experts »

> **À lire intégralement avant toute modification.**
> Rédigé pour qu'un nouveau chat Claude Code reprenne le projet **à partir de ce seul fichier + le code**, sur **n'importe quel PC**, sans historique de conversation.
> Toutes les valeurs de ce document ont été **mesurées sur le code et la base réels** (`migrate:status`, `route:list`, `information_schema`, lecture des sources, `npm run lint`).

**Dernière mise à jour :** 2026-09-18
**Emplacement du projet :** variable selon la machine — voir §2. **Aucun chemin utilisateur absolu n'est supposé dans ce document.**

---

## 0. LE PROJET EN UNE PAGE

**Quoi :** application de gestion interne pour un cabinet comptable + centre de domiciliation d'entreprises au Maroc (« Via Experts »).

**Architecture :** deux dossiers indépendants à la racine du projet — `frontend/` (SPA React/Vite) et `backend/` (API Laravel).

### Chiffres réels vérifiés (2026-09-21)

| Élément | Valeur vérifiée | Commande de contrôle |
|---|---|---|
| Migrations | **49** (0 en attente) | `artisan migrate:status` |
| Tables MySQL | **41** = 37 métier + 4 Laravel | `SHOW TABLES` |
| Modèles Eloquent | **37** | `app/Models/` |
| Contrôleurs API | **24** | `app/Http/Controllers/Api/V1/` |
| Routes API | **179** | `artisan route:list --path=api` |
| Permissions | **148** réparties en **16 groupes** | table `permissions` |
| Fichiers `frontend/src/api/` | **20** | disque |
| Tests Laravel | **218** tests dans **20 fichiers** | `tests/Feature/` + `tests/Unit/` |
| Pages React | **30** | `frontend/src/pages/` |
| Composants partagés | **21** | `frontend/src/components/` |
| Dépôt Git | **AUCUN** | pas de `.git` |

> ⚠️ **Ces compteurs sont la référence. Tout compteur différent trouvé ailleurs est périmé.**

### Pièges principaux du projet

1. **Toutes les permissions ne contrôlent pas un accès réel** — voir §7.4.
2. **Deux modules restent mock** : Calendrier de domiciliation et bloc « Analyse de Domiciliation » du Dashboard (§9). **Le Data Center, lui, est terminé.**
3. **`routes/api.php` et `PermissionSeeder.php` contiennent des commentaires historiques FAUX** — voir §16.
4. **Aucun dépôt Git** : aucun rollback possible.

---

## 1. STACK ET VERSIONS VÉRIFIÉES

| Élément | Version mesurée | Comment revérifier |
|---|---|---|
| PHP | **8.0.30** (ZTS, XAMPP) | `php -v` |
| Laravel | **9.52.22** | `artisan --version` |
| Sanctum | **^3.0** (mode SPA : cookie/session + CSRF, **pas de token Bearer**) | `composer.json` |
| Composer | **2.10.3** | `php composer.phar --version` |
| MariaDB | **10.4.32-MariaDB** | `SELECT VERSION();` |
| Node.js | **v24.21.0** | `node -v` |
| npm | **11.19.0** | `npm -v` |
| React / React DOM | **19.2.8** | `frontend/package.json` |
| react-router-dom | **7.18.3** — **HashRouter** (URLs `#/clients`) | `frontend/src/App.jsx` |
| Vite | **8.3.0** | `frontend/package.json` |
| Tailwind CSS | **4.3.3** (via `@tailwindcss/postcss`) | `frontend/package.json` |
| Lint | **oxlint 1.81.0** | `npm run lint` |
| Icônes / Graphiques | `lucide-react` 1.46 · `recharts` 3.10 | `frontend/package.json` |
| State manager | **Aucun** (ni Redux ni Zustand) — React Context uniquement | — |

**PHP 8.0 plafonne volontairement le projet à Laravel 9. Décision assumée : ne pas tenter de monter de version.**

**Extensions PHP absentes** (ne pas tenter de les activer, ne pas toucher à XAMPP) :
- **`zip`** → contourné par `App\Support\ZipSimple` (générateur ZIP natif, format « stored »).
- **`gd`** → `UploadedFile::fake()->image()` échoue dans les tests ; utiliser `->create()`.

---

## 2. INSTALLATION SUR UN PC NEUF

> Cette section suppose que **rien** n'est installé et que le dossier du projet vient d'être copié.
> **Aucun chemin absolu n'est imposé** : adapter selon la machine.

### 2.0 Localiser le projet et les outils

Le projet peut se trouver n'importe où (`C:\Users\<moi>\Desktop\Via Expert App`, `D:\projets\via-expert`, …).
**Toutes les commandes de ce document sont données relativement à la racine du projet**, qui contient :

```
PASSATION_CLAUDE.md
backend/
frontend/
composer.phar
.claude/launch.json
```

Si PHP et MySQL viennent de XAMPP, **repérer d'abord où XAMPP est installé sur CETTE machine** :

```powershell
# Emplacements courants à tester ; adapter au PC
Test-Path "C:\xampp\php\php.exe"
Test-Path "$env:USERPROFILE\Downloads\xampp\php\php.exe"
```

Puis définir une variable pour la session, pour ne plus écrire de chemin en dur :

```powershell
$PHP   = "C:\xampp\php\php.exe"          # ← ADAPTER
$MYSQL = "C:\xampp\mysql\bin\mysql.exe"  # ← ADAPTER
& $PHP -v
```

> ℹ️ Sur la machine de rédaction (2026-09-18), XAMPP est dans `C:\xampp`. **Ne pas considérer ce chemin comme acquis sur une autre machine.**

### A. Pré-requis à installer

| Outil | Version de référence | Remarque |
|---|---|---|
| PHP | 8.0.x (8.0.30 testé) | fourni par XAMPP ; extensions `zip` et `gd` non requises |
| Composer | 2.x | **ou** utiliser le `composer.phar` déjà présent à la racine |
| Node.js | 24.x (24.21.0 testé) | inclut npm |
| npm | 11.x | |
| MariaDB **ou** MySQL | MariaDB 10.4.32 testé | service **démarré** avant toute commande artisan |
| XAMPP (optionnel) | fournit PHP + MariaDB | Apache **facultatif**, seul MySQL est nécessaire |

### B. Backend (`backend/`)

```powershell
cd backend

# 1. Dépendances PHP
& $PHP ..\composer.phar install
#   (ou simplement : composer install, si Composer est installé globalement)

# 2. Fichier d'environnement — le créer seulement s'il n'existe pas
if (-not (Test-Path .env)) { Copy-Item .env.example .env }

# 3. Clé applicative — seulement si APP_KEY est vide dans .env
& $PHP artisan key:generate

# 4. Créer la base de développement
& $MYSQL -uroot -e "CREATE DATABASE IF NOT EXISTS via_expert_app CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"

# 5a. Cas « reprise du projet » : importer le dump fourni (RECOMMANDÉ)
#     — préserve les 11 centres, les utilisateurs et les 123 user_permissions (§10)
& $MYSQL -uroot via_expert_app -e "source chemin\vers\dump.sql"

# 5b. Cas « base neuve » uniquement (aucun dump disponible)
& $PHP artisan migrate --force
& $PHP artisan db:seed --force                # admin + PermissionSeeder
#     Le seeder de permissions est idempotent et peut être relancé seul :
& $PHP artisan db:seed --class=PermissionSeeder --force

# 6. Lien symbolique des fichiers publics (OBLIGATOIRE — voir §4)
& $PHP artisan storage:link

# 7. Démarrer l'API
& $PHP artisan serve --port=8000
```

Variables à vérifier dans `backend/.env` (valeurs de la machine de référence, **sans secret**) :

```
APP_URL=http://localhost:8000
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=via_expert_app
DB_USERNAME=root
DB_PASSWORD=          # vide sur XAMPP par défaut — adapter à la machine
SESSION_DRIVER=file
SESSION_DOMAIN=localhost
SANCTUM_STATEFUL_DOMAINS=localhost:5173,127.0.0.1:5173,localhost:5180,127.0.0.1:5180
```

### C. Frontend (`frontend/`)

```powershell
cd frontend
npm install

# Créer frontend/.env s'il est absent :
#   VITE_API_URL=http://localhost:8000
npm run dev          # port 5173
```

- `frontend/.env` ne contient qu'une seule variable : **`VITE_API_URL`**.
- Valeur de repli codée en dur si le fichier manque : `http://localhost:8000` ([http.js:1](frontend/src/api/http.js:1)).
- Deux configurations de dev sont déclarées dans `.claude/launch.json` : port **5173** (défaut) et port **5180**.

### D. Authentification Sanctum — les 5 réglages qui doivent être cohérents

Sanctum fonctionne ici en **mode SPA par cookie de session**. Si l'un de ces cinq réglages diverge, le login renvoie 419 ou 401 **sans message explicite**.

| Réglage | Où | Valeur de référence |
|---|---|---|
| `APP_URL` | `backend/.env` | `http://localhost:8000` |
| `SESSION_DOMAIN` | `backend/.env` | `localhost` |
| `SANCTUM_STATEFUL_DOMAINS` | `backend/.env` | `localhost:5173,127.0.0.1:5173,localhost:5180,127.0.0.1:5180` |
| `allowed_origins` | `backend/config/cors.php` | `env('FRONTEND_URL','http://localhost:5173')` **+** `http://localhost:5180` (+ `supports_credentials` actif) |
| `VITE_API_URL` | `frontend/.env` | `http://localhost:8000` |

> ⚠️ **Changer le port du frontend sans mettre à jour `SANCTUM_STATEFUL_DOMAINS` ET `config/cors.php` casse la connexion.**
> Le frontend appelle `GET /sanctum/csrf-cookie` avant chaque écriture (`ensureCsrfCookie()`).

### E. Comptes

- Le compte **administrateur** et son mot de passe initial sont définis dans `backend/database/seeders/DatabaseSeeder.php` (`firstOrCreate` : relancer le seeder ne réécrit pas un mot de passe existant).
- **Aucun mot de passe n'est reproduit dans ce document** — lire le seeder ou demander à l'utilisatrice.
- Un second compte **non-admin** existe en base (§10) : **donnée réelle, ne pas supprimer**.

---

## 3. CHECKLIST DE TRANSFERT

À cocher dans l'ordre sur la nouvelle machine :

```
[ ] Copier TOUT le dossier du projet (backend/, frontend/, .claude/, composer.phar, *.md)
[ ] Copier backend/storage/app/public/  ← fichiers hors base (§4) — NE PAS OUBLIER
[ ] Exporter / importer la base via_expert_app (mysqldump) OU prévoir migrate + seed
[ ] Installer PHP, Composer, Node.js, npm, MariaDB/MySQL (§2.A)
[ ] backend : composer install
[ ] frontend : npm install
[ ] Configurer backend/.env (DB, APP_URL, SESSION_DOMAIN, SANCTUM_STATEFUL_DOMAINS)
[ ] Configurer frontend/.env (VITE_API_URL)
[ ] Créer la base via_expert_app
[ ] php artisan migrate  (ou importer le dump)
[ ] php artisan db:seed --class=PermissionSeeder  (si base neuve ; idempotent)
[ ] php artisan storage:link
[ ] Démarrer Laravel : php artisan serve --port=8000
[ ] Démarrer React : npm run dev (port 5173)
[ ] Tester le login dans le navigateur
[ ] Tester une route API protégée (ex. GET /api/v1/clients) et un 403 non-admin
[ ] Créer la base de test : CREATE DATABASE via_expert_app_test;   ← §12
    (obligatoire sur un PC neuf : sans elle, les 204 tests échouent à la connexion)
[ ] Lancer php artisan test
[ ] npm run lint
[ ] npm run build
```

---

## 4. 🔴 FICHIERS HORS BASE DE DONNÉES À PRÉSERVER

> **Ces fichiers ne sont PAS dans MySQL. Un `mysqldump` seul ne les sauvegarde pas.
> Les oublier lors d'une copie = photos, logos, signatures et documents définitivement perdus.**

**Dossier concerné : `backend/storage/app/public/`**

État réellement constaté au 2026-09-18 — **6 fichiers réels** :

| Sous-dossier | Contenu constaté | Référencé en base par |
|---|---|---|
| `profiles/` | 1 photo de profil utilisateur | `users.photo_path` |
| `rapports/` | 1 document de rapport | `rapports.document_nom` / `document_chemin` |
| `settings/cabinet/` | 2 fichiers : logo + signature du **Bureau de Comptabilité** | `cabinet_settings.logo_path` / `signature_path` |
| `settings/domiciliation/` | 2 fichiers : logo + signature du **Centre de Domiciliation** | `domiciliation_settings.logo_path` / `signature_path` |

**Autres sous-dossiers alimentés par l'application** (vides aujourd'hui, mais à copier s'ils se remplissent) : documents de domiciliation (`domiciliation_documents.chemin`), pièces jointes de paiement (`paiements.piece_jointe_chemin`), fichiers des opérations Cachets / Mails / Services En Cours (`*_operations.fichier_chemin`).

### Règles de transfert

1. **Copier `backend/storage/app/public/` en entier**, en même temps que le dump SQL.
2. **Ne jamais copier `backend/public/storage`** : c'est un **lien symbolique**, il ne survit pas de façon fiable à une copie Windows.
3. Sur la machine cible, recréer le lien :

```bash
php artisan storage:link
```

4. Vérifier ensuite qu'une image de `storage/app/public/` est bien servie sur `http://localhost:8000/storage/...`.

---

## 5. ARCHITECTURE

### 5.1 Frontend (`frontend/src/`)

```
api/         → 20 fichiers, 1 par ressource backend (+ http.js)
components/  → 21 composants partagés
context/     → AuthContext, FilesContext, NotesContext
data/        → mockData.js (⚠️ résiduel, voir §15)
pages/       → 30 pages
utils/       → format.js, exporters.js
App.jsx      → toutes les routes React (HashRouter)
```

**Couche API — `api/http.js` est le cœur.** Il exporte `API_URL`, `ApiError` (porte `status` + `errors`), `ensureCsrfCookie()`, `apiFetch()` (JSON + CSRF) et `apiUpload()`.

⚠️ `apiUpload(path, payload)` accepte **soit un `File`** (envoyé sous le champ `file` — comportement historique des logos/photos), **soit un `FormData` déjà construit** (passé tel quel).

⚠️ **`apiFetch` déduplique et met en cache les GET** :
- deux GET **identiques** rapprochés (< `GET_CACHE_TTL` = **10 s**) partagent **une seule** requête réseau ;
- **toute écriture** (POST/PUT/DELETE/`apiUpload`) **vide le cache** — y compris `login`/`logout`, ce qui empêche une session d'hériter des données de la précédente ;
- une réponse **en erreur n'est jamais mémorisée** : un 403 repart vers le serveur à chaque appel ;
- chaque appelant reçoit une **copie isolée** de la réponse (pas d'aliasing entre composants) ;
- `apiFetch(path, { cache: false })` force un appel réseau.

🚨 **Liste `NO_CACHE` — GET à EFFET DE BORD, à ne jamais mettre en cache** ([http.js:41](frontend/src/api/http.js:41)) :
- **`/chat/{id}/messages`** : ce GET **écrit** en base — il marque les messages reçus comme lus (`ChatController::messages` → `read_at`) ;
- **`/numero-propose`** : le numéro proposé doit toujours refléter l'état réel du compteur.

**Avant d'ajouter un GET au projet, vérifier qu'il n'écrit rien ; s'il écrit, l'ajouter à `NO_CACHE`.**

**Composants partagés à connaître :**

| Composant | Rôle |
|---|---|
| `DataTable.jsx` | Tableau **client-side** : reçoit toutes les lignes, recherche/tri/pagination en mémoire, sélecteur Show 10/25/50/100. Props utiles : `actionsHeader`, **`rowClassName(row)`** |
| `ServerTable.jsx` | Tableau **server-side** : le parent gère `page`/`perPage`/`search`, consomme les métadonnées Laravel `paginate()` |
| `ExportMenu.jsx` | Menu d'export **réel** : Imprimer / CSV / Excel / PDF. Prend `columns: [{header, value(row)}]` |
| `utils/exporters.js` | `exportCsv` (.csv), `exportExcel` (.xls MIME Excel), `printTable` / `printHtml` (impression par iframe cachée, non bloquée par les pop-ups) |
| `ConfirmDialog.jsx` | Modale Annuler / Supprimer |
| `Field.jsx` | `Field`, `Input`, `Select`, `Textarea`, `Checkbox`, `FormCard` — **toujours réutiliser**. ⚠️ `Field` n'a **pas** de prop `error` : afficher l'erreur en enfant |
| `Sidebar.jsx` + `navConfig.js` | Navigation. **Modifier `navConfig.js` uniquement**, jamais `Sidebar.jsx` |
| `ListToolbar.jsx` | `ToolBtn`, `RowBtn` — ⚠️ aucun `onClick` par défaut |
| `DocumentList.jsx` / `DocumentForm.jsx` | Génériques Facturation (4 types) |

**Authentification frontend :** `context/AuthContext.jsx` appelle `GET /auth/me` au montage.
⚠️ **L'objet `user` est le modèle Laravel brut (snake_case)** : `is_admin`, `photo_path`. Ne pas écrire `user.isAdmin`. En revanche `GET /users` passe par `UserResource` et renvoie du **camelCase**. Les deux formes coexistent volontairement.

### 5.2 Backend

Toutes les routes dans `backend/routes/api.php`, préfixées `/api/v1`, contrôleurs dans `app/Http/Controllers/Api/V1/` (**24**).

```
app/Http/Controllers/Api/V1/   → 24 contrôleurs
app/Http/Requests/             → 24 FormRequests (Store*/Update*)
app/Http/Resources/            → 8 Resources (Client, Entreprise, Domiciliation,
                                  DocumentCommercial, Paiement, DeclarationTva,
                                  ServiceEnCours, User)
app/Http/Middleware/           → dont EnsureIsAdmin.php et CheckPermission.php
app/Models/                    → 32 modèles
app/Support/ZipSimple.php      → générateur ZIP (extension PHP zip absente)
database/migrations/           → 49 migrations
database/seeders/              → DatabaseSeeder + PermissionSeeder
```

**Middlewares** (`app/Http/Kernel.php` → `$routeMiddleware`) :
- `admin` → `EnsureIsAdmin` — bloque si `is_admin` faux ;
- `permission:<module>,<action>` → `CheckPermission` — 401 si non connecté, 403 si `User::hasPermission()` faux.

**Policies : aucune.** Tout le contrôle passe par ces 2 middlewares + des appels directs à `hasPermission()` dans 8 contrôleurs (§7.3).

---

## 6. BASE DE DONNÉES

### 6.1 Les 49 migrations (toutes exécutées, 0 en attente)

| # | Migration | Crée / modifie |
|---|---|---|
| 1 | `2014_10_12_000000_create_users_table` | `users` |
| 2 | `2014_10_12_100000_create_password_resets_table` | `password_resets` |
| 3 | `2019_08_19_000000_create_failed_jobs_table` | `failed_jobs` |
| 4 | `2019_12_14_000001_create_personal_access_tokens_table` | `personal_access_tokens` |
| 5 | `2026_09_16_142119_create_parties_table` | `parties` (+ CHECK type / status) |
| 6 | `2026_09_16_142120_create_clients_table` | `clients` (+ CHECK type) |
| 7 | `2026_09_16_150954_create_centres_domiciliation_table` | `centres_domiciliation` (+ **seed des 11 centres**) |
| 8 | `2026_09_16_150954_create_entreprises_table` | `entreprises` (+ CHECK type) |
| 9 | `2026_09_16_150955_create_entreprise_secteurs_table` | `entreprise_secteurs` |
| 10 | `2026_09_16_165128_add_is_admin_and_fonction_to_users_table` | `users.is_admin`, `users.fonction`, `users.telephone` |
| 11 | `2026_09_16_165129_create_permissions_table` | `permissions` |
| 12 | `2026_09_16_165131_create_user_permissions_table` | `user_permissions` |
| 13 | `2026_09_17_090000_create_cabinet_settings_table` | `cabinet_settings` |
| 14 | `2026_09_17_090001_create_domiciliation_settings_table` | `domiciliation_settings` |
| 15 | `2026_09_17_090002_create_service_statuses_table` | `service_statuses` |
| 16 | `2026_09_17_100000_add_branding_to_cabinet_settings_table` | logo/signature + compteurs de numérotation |
| 17 | `2026_09_17_100001_add_branding_to_domiciliation_settings_table` | idem côté domiciliation |
| 18 | `2026_09_17_110000_add_photo_to_users_table` | `users.photo_path` |
| 19 | `2026_09_17_110001_create_cachet_statuses_table` | `cachet_statuses` |
| 20 | `2026_09_17_110002_create_mail_statuses_table` | `mail_statuses` |
| 21 | `2026_09_17_120000_extend_permissions_action_length` | allonge `permissions.action` |
| 22 | `2026_09_17_130000_create_domiciliations_table` | `domiciliations` |
| 23 | `2026_09_17_130001_create_domiciliation_observations_table` | `domiciliation_observations` |
| 24 | `2026_09_17_130002_create_domiciliation_documents_table` | `domiciliation_documents` |
| 25 | `2026_09_17_130003_create_services_table` | `services` |
| 26 | `2026_09_17_130004_create_chat_messages_table` | `chat_messages` |
| 27 | `2026_09_17_140000_create_service_en_cours_table` | `service_en_cours` |
| 28 | `2026_09_17_140001_create_service_en_cours_operations_table` | `service_en_cours_operations` |
| 29 | `2026_09_17_150000_create_documents_commerciaux_table` | `documents_commerciaux` |
| 30 | `2026_09_17_150001_create_document_lignes_table` | `document_lignes` |
| 31 | `2026_09_17_160000_create_paiements_table` | `paiements` |
| 32 | `2026_09_17_160001_create_paiement_lignes_table` | `paiement_lignes` |
| 33 | `2026_09_17_170000_create_declarations_tva_table` | `declarations_tva` |
| 34 | `2026_09_17_170001_create_declaration_tva_lignes_table` | `declaration_tva_lignes` |
| 35 | `2026_09_17_170002_add_type_to_declarations_tva_table` | `declarations_tva.type` (tva / chiffre_affaire) |
| 36 | `2026_09_17_180000_create_rapports_table` | `rapports` |
| 37 | `2026_09_17_190000_create_cachets_table` | `cachets` |
| 38 | `2026_09_17_190001_create_cachet_operations_table` | `cachet_operations` |
| 39 | `2026_09_17_200000_create_mails_table` | `mails` |
| 40 | `2026_09_17_200001_create_mail_operations_table` | `mail_operations` |
| 41 | `2026_09_18_120000_create_data_center_fiches_table` | `data_center_fiches` (Data Center) |
| 42 | **`2026_09_19_100000_create_entreprise_associes_table`** | **`entreprise_associes`** (personnes rattachées : nom / CIN / rôle) |
| 43 | **`2026_09_19_100001_create_entreprise_documents_table`** | **`entreprise_documents`** (bloc Documents de la fiche entreprise) |
| 44 | **`2026_09_19_100002_create_entreprise_observations_table`** | **`entreprise_observations`** (historique des observations) |
| 45 | **`2026_09_21_100000_add_privee_to_entreprise_observations_table`** | **`entreprise_observations.privee`** (case « Observation privée ») |
| 46 | **`2026_09_21_100001_create_entreprise_observation_fichiers_table`** | **`entreprise_observation_fichiers`** (pièces jointes d'une observation) |
| 47 | **`2026_09_21_110000_create_domiciliation_operations_table`** | **`domiciliation_operations`** (journal Renouveler / Déclarer / Résilier) |
| 48 | **`2026_09_21_110001_add_renouvelle_de_id_to_domiciliations_table`** | **`domiciliations.renouvelle_de_id`** (lien de renouvellement) |
| 49 | **`2026_09_22_100000_add_created_by_to_parties_table`** | **`parties.created_by`** (« Créé par », commun à Client et Entreprise) |

> Les migrations 42 à 48 sont **purement additives** : cinq tables neuves et
> deux colonnes nullables, aucune
> table ni colonne existante modifiée. `entreprises.client_id` et
> `entreprises.observation` sont **conservés** et restent alimentés.

### 6.2 Les 41 tables et leurs colonnes réelles

#### Tiers (socle)

| Table | Colonnes |
|---|---|
| `parties` | `id`, `type` (`client`\|`entreprise`), `status` (`actif`\|`archive`\|`corbeille`, défaut `actif`), **`created_by`** (nullable, membre du système qui a créé la fiche), `created_at`, `updated_at`, `deleted_at` |
| `clients` | **PK `party_id`**, `type` (défaut `client`), `genre`, `nom`, `nom_ar`, `nationalite`, `date_naissance`, `cin`, `email`, `telephone`, `telephone_2`, `adresse`, `adresse_ar` — ⚠️ `nom_ar`/`adresse_ar` **conservées en base** (anciennes valeurs lisibles), mais retirées du formulaire Client (2026-09-21) : plus aucune saisie/édition en arabe |
| `entreprises` | **PK `party_id`**, `type` (défaut `entreprise`), `denomination`, `tribunal`, `forme_juridique`, `ice`, `rc`, `if`, `tp`, `cnss`, `date_debut_activite`, `capital`, `situation` (défaut `Normale`), `single`, `periode_declaration_tva`, `local`, `centre_domiciliation_id`, `client_id`, `numero_dossier`, `numero_archive`, `observation` |
| `entreprise_secteurs` | `id`, `entreprise_id`, `secteur`, `activite`, `ordre` |
| `entreprise_associes` | `id`, `entreprise_id`, `nom`, `cin`, `type`, `adresse`, `telephone`, `telephone_2`, `email`, `ordre`, timestamps — `type` ∈ **Partenaire · Gèrent · Co-Gèrent · Associé · Gérant non Associé** (constante `EntrepriseAssocie::TYPES`, validée par l'API) |
| `entreprise_documents` | `id`, `entreprise_id`, `nom`, `chemin`, `mime`, `taille`, `status` (`actif`\|`archive`\|`corbeille`, défaut `actif`), `uploaded_by`, `deleted_at`, timestamps |
| `entreprise_observations` | `id`, `entreprise_id`, `contenu`, `status` (`actif`\|`archive`\|`corbeille`, défaut `actif`), **`privee`** (booléen, défaut `false`), `created_by`, `deleted_at`, timestamps |
| `entreprise_observation_fichiers` | `id`, `observation_id`, `nom`, `chemin`, `mime`, `taille`, `uploaded_by`, `deleted_at`, timestamps — **plusieurs pièces jointes par observation** |
| `centres_domiciliation` | `id`, `nom` (**unique**), `if`, `ice`, `ville`, `adresse`, `telephone`, timestamps — ⚠️ **ni `email`, ni `n_archive`, ni `status`, ni `deleted_at`** |

#### Auth / droits

| Table | Colonnes |
|---|---|
| `users` | `id`, `name`, `email` (**unique**), `is_admin`, `fonction`, `telephone`, `photo_path`, `email_verified_at`, `password`, `remember_token`, timestamps |
| `permissions` | `id`, `module`, `action` — **unique (module, action)** |
| `user_permissions` | `id`, `user_id`, `permission_id`, `granted_by`, `granted_at` — **unique (user_id, permission_id)** |

#### Domiciliation

| Table | Colonnes |
|---|---|
| `domiciliations` | `id`, `entreprise_id`, `centre_domiciliation_id`, `mois_payee`, `mois_gratuits`, `date_depart`, `date_fin`, `mode_paiement`, `prix_par_mois`, `prix_total`, `signature_sur_facture`, `date_facture`, `date_paiement`, `date_legalisation`, `doc_facture`, `doc_contrat`, `doc_attestation`, `doc_procuration`, `etat` (défaut `active`), `status`, `date_resiliation`, `date_declaration`, `created_by`, `deleted_at`, timestamps |
| `domiciliation_observations` | `id`, `domiciliation_id`, `contenu`, `created_by`, timestamps |
| `domiciliation_documents` | `id`, `domiciliation_id`, `nom`, `chemin`, `mime`, `taille`, `uploaded_by`, timestamps |
| `domiciliation_operations` | `id`, `domiciliation_id`, `type` (`renouvellement`\|`declaration`\|`resiliation`), `commentaire`, `fichier_nom`, `fichier_chemin`, `created_by`, timestamps — **journal des actions métier**, même forme que `service_en_cours_operations` |

#### Services

| Table | Colonnes |
|---|---|
| `services` | `id`, `via_experts`, `maitre`, `nom`, `prix`, `status`, `created_by`, `deleted_at`, timestamps |
| `service_en_cours` | `id`, `service_id`, `client_id`, `service_status_id`, `date_depart`, `derniere_operation`, `status`, `created_by`, `deleted_at`, timestamps |
| `service_en_cours_operations` | `id`, `service_en_cours_id`, `service_status_id`, `commentaire`, `fichier_nom`, `fichier_chemin`, `created_by`, timestamps |

#### Facturation

| Table | Colonnes |
|---|---|
| `documents_commerciaux` | `id`, `type` (`facture`\|`devis`\|`bl`\|`avoir`), `emetteur`, `responsable`, `party_id`, `numero`, `date_document`, `date_paiement`, `date_credit`, `mode_paiement`, `signature`, `note`, `total_ht`, `total_remise`, `total_net_ht`, `total_tva`, `total_ttc`, **`prix_paye`**, `status`, `created_by`, `deleted_at`, timestamps — **unique (type, numero)** |
| `document_lignes` | `id`, `document_id`, `service_id`, `designation`, `quantite`, `prix_unitaire`, `remise_pourcent`, `tva_pourcent`, `ordre`, timestamps |

#### Paiements

| Table | Colonnes |
|---|---|
| `paiements` | `id`, `reference` (**unique**), `emetteur`, `responsable`, `party_id`, **`document_id`**, `date_operation`, `date_credit`, `mode_paiement`, `signature`, `piece_jointe_nom`, `piece_jointe_chemin`, `observation`, `total`, `prix_paye`, `status`, `created_by`, `deleted_at`, timestamps |
| `paiement_lignes` | `id`, `paiement_id`, `service_id`, `designation`, `quantite`, `prix_unitaire`, `ordre`, timestamps |

#### TVA / Chiffre d'affaire

| Table | Colonnes |
|---|---|
| `declarations_tva` | `id`, `type` (`tva`\|`chiffre_affaire`, défaut `tva`), `entreprise_id`, `client_if`, `identifiant_paiement`, `periode_type`, `periode_valeur`, `annee`, `regime`, `situation` (défaut `non_declaree`), `total_ht`, `total_tva`, `total_ttc`, `status`, `created_by`, `deleted_at`, timestamps |
| `declaration_tva_lignes` | `id`, `declaration_id`, `ordre_ref`, `fact_num`, `designation`, `ht`, `tva`, `ttc`, `identifiant_fiscal`, `libelle_fournisseur`, `ice`, `taux`, `id_paie`, `date_paie`, `date_fac`, `ordre`, timestamps |

#### Rapports / Cachets / Mails / Chat

| Table | Colonnes |
|---|---|
| `rapports` | `id`, `emetteur` (défaut `via_experts`), `rapport_de`, `date_rapport`, `montant_restant`, `revenu_local`, `revenu_externe`, `depense_jour`, `solde_caisse`, `total_revenu_jour`, `descriptive`, `document_nom`, `document_chemin`, `status`, `created_by`, `deleted_at`, timestamps |
| `cachets` | `id`, `party_id`, `cachet_status_id`, `lignes`, `date_depart`, `derniere_operation`, `status`, `created_by`, `deleted_at`, timestamps |
| `cachet_operations` | `id`, `cachet_id`, `cachet_status_id`, `commentaire`, `fichier_nom`, `fichier_chemin`, `created_by`, timestamps |
| `mails` | `id`, `party_id`, `mail_status_id`, `date_depart`, `derniere_operation`, `status`, `created_by`, `deleted_at`, timestamps |
| `mail_operations` | `id`, `mail_id`, `mail_status_id`, `commentaire`, `fichier_nom`, `fichier_chemin`, `created_by`, timestamps |
| `chat_messages` | `id`, `sender_id`, `recipient_id`, `body`, `read_at`, timestamps |

#### Data Center

| Table | Colonnes |
|---|---|
| **`data_center_fiches`** | `id`, `denomination`, `ice`, `if`, `rc`, `tp`, `status` (défaut `actif`), `created_by`, `deleted_at`, timestamps — index `(status, denomination)`, **aucune contrainte d'unicité** (volontaire : la référence montre des lignes avec RC/TP vides) |

#### Configuration / Statuts

| Table | Colonnes |
|---|---|
| `cabinet_settings` | `id`, `logo_path`, `signature_path`, `nom_societe`, `references_recu`, `afficher_entreprise_info_recu`, `ice_societe`, `entreprise_info`, puis **4 blocs de numérotation** `{facture,devis,bl,avoir}_{prefixe,prochain_numero,suffixe}`, timestamps |
| `domiciliation_settings` | idem **+** `gerant`, `prix_domiciliation` |
| `service_statuses` / `cachet_statuses` / `mail_statuses` | `id`, `nom` (**unique**), `couleur_texte`, `couleur_fond`, timestamps |

#### Laravel (4)

`migrations`, `password_resets`, `failed_jobs`, `personal_access_tokens`.

### 6.3 Clés étrangères réelles (51 FK) et règles ON DELETE

| Depuis | Vers | ON DELETE |
|---|---|---|
| `clients(party_id, type)` | `parties(id, type)` | **CASCADE** — FK **composite typée** |
| `entreprises(party_id, type)` | `parties(id, type)` | **CASCADE** — FK **composite typée** |
| `entreprises.client_id` | `clients(party_id)` | SET NULL |
| `entreprises.centre_domiciliation_id` | `centres_domiciliation` | **RESTRICT** |
| `entreprise_secteurs.entreprise_id` | `entreprises(party_id)` | CASCADE |
| `entreprise_associes.entreprise_id` / `entreprise_documents.entreprise_id` / `entreprise_observations.entreprise_id` | `entreprises(party_id)` | CASCADE |
| `entreprise_documents.uploaded_by` / `entreprise_observations.created_by` | `users(id)` | SET NULL |
| `entreprise_observation_fichiers.observation_id` | `entreprise_observations(id)` | CASCADE |
| `domiciliations.entreprise_id` | `entreprises(party_id)` | CASCADE |
| `domiciliations.centre_domiciliation_id` | `centres_domiciliation` | **RESTRICT** |
| `domiciliation_observations.domiciliation_id` / `domiciliation_documents.domiciliation_id` / `domiciliation_operations.domiciliation_id` | `domiciliations` | CASCADE |
| **`domiciliations.renouvelle_de_id`** | `domiciliations(id)` | **SET NULL** — auto-référence : la période prolongée |
| **`parties.created_by`** | `users(id)` | **SET NULL** |

> **`Client::entreprises()`** (2026-09-21) — `hasMany(Entreprise::class, 'client_id', 'party_id')`,
> le sens inverse d'`entreprises.client_id`. Alimente le bloc « Entreprise » de
> la page Informations Client (`GET /clients/{client}` charge
> `entreprises.centreDomiciliation`). Pas de migration : la FK existait déjà,
> seule la relation Eloquent manquait.
| `documents_commerciaux.party_id` | `parties` | **RESTRICT** |
| `document_lignes.document_id` | `documents_commerciaux` | CASCADE |
| `document_lignes.service_id` | `services` | SET NULL |
| `paiements.party_id` | `parties` | **RESTRICT** |
| **`paiements.document_id`** | `documents_commerciaux` | **SET NULL** — ⚠️ **c'est ce lien qui déclenche la synchro du prix payé (§13-1)** |
| `paiement_lignes.paiement_id` | `paiements` | CASCADE |
| `paiement_lignes.service_id` | `services` | SET NULL |
| `declarations_tva.entreprise_id` | `entreprises(party_id)` | CASCADE |
| `declaration_tva_lignes.declaration_id` | `declarations_tva` | CASCADE |
| `service_en_cours.service_id` | `services` | **RESTRICT** |
| `service_en_cours.client_id` | `clients(party_id)` | CASCADE |
| `service_en_cours.service_status_id` | `service_statuses` | SET NULL |
| `service_en_cours_operations.service_en_cours_id` | `service_en_cours` | CASCADE |
| `cachets.party_id` / `mails.party_id` | `parties` | CASCADE |
| `cachets.cachet_status_id` / `mails.mail_status_id` | `*_statuses` | SET NULL |
| `cachet_operations.cachet_id` / `mail_operations.mail_id` | `cachets` / `mails` | CASCADE |
| `chat_messages.sender_id` / `recipient_id` | `users` | CASCADE |
| `user_permissions.user_id` | `users` | CASCADE |
| `user_permissions.permission_id` | `permissions` | CASCADE |
| `user_permissions.granted_by` | `users` | SET NULL |
| **`created_by` / `uploaded_by`** de toutes les tables métier (dont `data_center_fiches`) | `users` | SET NULL |

### 6.4 Contraintes d'unicité réelles

`parties(id, type)` (`uq_parties_id_type`, support de la FK composite) · `users.email` · `permissions(module, action)` · `user_permissions(user_id, permission_id)` · `clients.cin` · `clients.email` · `entreprises.ice` · `entreprises.if` · `entreprises(tribunal, rc)` · `centres_domiciliation.nom` · `service_statuses.nom` · `cachet_statuses.nom` · `mail_statuses.nom` · **`documents_commerciaux(type, numero)`** (un numéro est réutilisable entre types) · `paiements.reference` · `failed_jobs.uuid` · `personal_access_tokens.token`.

### 6.5 Statuts et cycle de vie

**Cycle archive standard, identique pour TOUS les modules métier :**

```
status = 'actif'  →  'archive'  →  'corbeille'  →  « suppression définitive » = SOFT DELETE
```

- `destroy()` **refuse (422)** si l'élément n'est pas déjà dans la corbeille.
- **`forceDelete()` n'est exposé nulle part.**
- Tables portant `status` + `deleted_at` (**SoftDeletes**) : `parties`, `domiciliations`, `services`, `service_en_cours`, `documents_commerciaux`, `paiements`, `declarations_tva`, `rapports`, `cachets`, `mails`, **`data_center_fiches`**.
- Statuts métier additionnels : `domiciliations.etat` (`active` par défaut ; le statut affiché est **calculé**, jamais stocké — `Domiciliation::statutAffichage`, priorité `resilie > declare > expire > alerte > active`, `JOURS_ALERTE = 30`) · `declarations_tva.situation` (`non_declaree` / `declaree`) · `entreprises.situation` (`Normale` par défaut).

### 6.6 Contraintes CHECK — point à vérifier

Les migrations déclarent 4 contraintes CHECK :

```sql
chk_parties_type    CHECK (type IN ('client','entreprise'))
chk_parties_status  CHECK (status IN ('actif','archive','corbeille'))
chk_clients_type    CHECK (type = 'client')
chk_entreprises_type CHECK (type = 'entreprise')
```

⚠️ **Constat du 2026-09-18 :** ces contraintes **n'apparaissent pas** dans `SHOW CREATE TABLE` ni dans `information_schema.CHECK_CONSTRAINTS` sur la base de dev actuelle. La **FK composite typée**, elle, est bien présente et suffit à garantir l'exclusivité Client/Entreprise.
→ Une base recréée par `artisan migrate` sur un PC neuf **aura** ces CHECK ; la base de dev actuelle **ne les a pas**. Différence à connaître avant tout diagnostic. **Voir §17, question ouverte n° 7.**

---

## 7. PERMISSIONS — RÈGLE CENTRALE

```php
// User::hasPermission($module, $action)
if ($this->is_admin) return true;              // ADMIN = accès métier total
return $this->userPermissions()                 // sinon : autorisé UNIQUEMENT si
    ->whereHas('permission', fn ($q) =>         // une ligne existe dans user_permissions
        $q->where('module', $module)
          ->where('action', $action))
    ->exists();                                 // sinon → 403
```

- **`is_admin = true`** → accès métier complet ; `user_permissions` n'est **jamais** consulté.
- **Non-admin** → **refus par défaut**, sur toute route effectivement protégée.
- **`users.fonction`** (Assistant / Comptable / Autre) est **purement informatif**, jamais une source de droits.
- **Aucune table `roles`** et il ne doit pas en être créé sans validation.

### 7.1 Catalogue — 148 permissions, 16 groupes (vérifié en base)

| # | Module | Nb | IDs | Actions |
|---|---|---|---|---|
| 1 | `clients` | 8 | 1–8 | `list, create, update, archive, corbeille, delete, add_observation, add_document` |
| 2 | `entreprises` | 10 | 9–18 | idem + `liste_noire, bloquer` |
| 3 | `domiciliation` | 17 | 19–35 | `ajouter, renouveler, facture, contrat, attestation, procuration, resilier, corbeille, archive, supprimer, list, gestion, calendrier, centres_list, ajouter_centres, modifier_centres, export_list` |
| 4 | `services` | 6 | 36–41 | `ajouter, modifier, archive, corbeille, supprimer, list` |
| 5 | `services_en_cours` | 6 | 42–47 | idem |
| 6 | `facturation` | 32 | 48–79 | 8 familles × 4 types (`ajouter_*`, `liste_*`, `archive_*`, `corbeille_*`, `supprimer_*`, `exporter_list_*`, `ajouter_centre_domiciliation_*`, `ajouter_bureau_comptabilite_*`) |
| 7 | `paiements` | 10 | 80–89 | `ajouter_paiement, ajouter_centre_domiciliation_paiement, ajouter_bureau_comptabilite_paiement, modifier_date_credits, gestion_paiements, list_paiements, exporter, archive, corbeille, supprimer` |
| 8 | `mouvement` | 2 | 90–91 | `mouvement_entres_recu, mouvement_entres_facture` |
| 9 | `declaration` | 13 | 92–104 | `ajouter, modifier, importeur, liste, sauvegarder_non_declare, sauvegarder_declaree, exporter_zip, exporter_xml, exporter_excel, exporter_list, archive, corbeille, supprimer` |
| 10 | `cashet` | 6 | 105–110 | `list, ajouter, modifier, archive, corbeille, supprimer` |
| 11 | `mails` | 6 | 111–116 | idem |
| 12 | **`data_center`** | 6 | 117–122 | `list, ajouter, modifier, archive, corbeille, supprimer` — **désormais réellement appliquées** |
| 13 | `chiffre_affaire` | 10 | 123–132 | `ajouter, modifier, liste, sauvegarder_non_declare, sauvegarder_declaree, exporter_excel, exporter_list, archive, corbeille, supprimer` |
| 14 | `parametre` | 8 | 133–140 | `account, mot_de_passe, bureau_comptabilite, centre_domiciliation, ajouter_services_status, ajouter_cashet_status, ajouter_mail_status, ajouter_assistance` |
| 15 | `rapports` | 6 | 141–146 | `list, ajouter, modifier, archive, corbeille, supprimer` *(ajouté après audit)* |
| 16 | `chat` | 2 | 147–148 | `list, envoyer` *(ajouté après audit)* |

Source de vérité côté code : **`PermissionSeeder::CATALOGUE`** (idempotent, `firstOrCreate`).

> 🔑 Les **16 permissions historiques ont conservé leurs IDs 1–16**. Aucune attribution n'a jamais été perdue.

> ⚠️ Les clés d'action de `clients` / `entreprises` restent **`create` / `update` / `delete`** (et non `ajouter`/`modifier`/`supprimer`) : elles sont référencées telles quelles par les middlewares. **Ne jamais les renommer.** Les modules plus récents utilisent les clés françaises. **Cette asymétrie est volontaire.**

### 7.2 Convention `restore`

Le catalogue **ne contient aucune action `restore`**. **Tous** les modules réutilisent la permission **`archive`** pour restaurer, y compris le Data Center. **À respecter pour tout nouveau module.**

### 7.3 Où les permissions sont vérifiées — 3 mécanismes

| Mécanisme | Modules concernés |
|---|---|
| **Middleware de route** `permission:<module>,<action>` | clients, entreprises, domiciliation, services, services_en_cours, **data_center**, lecture des centres |
| **Appel `hasPermission()` dans le contrôleur** (permission dépendante du type/action) | facturation, paiements, mouvement, declaration + chiffre_affaire, cashet, mails, rapports, chat (**8 contrôleurs**) |
| **Middleware `admin`** (sans permission individuelle) | `/users*`, `/permissions`, `/settings/*`, écriture des centres, `/*-statuses*` |

> ⚠️ Auditer avec `route:list` seul est **trompeur** : beaucoup de routes sans middleware visible sont protégées **dans le contrôleur**.

**Exception self-service :** `PUT /profile` et `POST|DELETE /profile/photo` sont protégés par `auth:sanctum` **seul** — chaque utilisateur agit sur son propre compte.

### 7.4 Permissions attribuables mais SANS effet réel

| Groupe / clé | Pourquoi sans effet |
|---|---|
| `parametre` (8 permissions) | La zone Paramètres est protégée par le middleware `admin` : un non-admin reçoit 403 **même si ces cases sont cochées** |
| `domiciliation.facture`, `.contrat`, `.attestation`, `.procuration`, `.calendrier`, `.export_list` | Actions correspondantes non implémentées |

> ✅ **`data_center` ne figure plus dans cette liste** : ses 6 permissions contrôlent désormais de vraies routes.
> ✅ **`domiciliation.renouveler` ne figure plus dans cette liste** (2026-09-21) : `POST /domiciliations/{d}/renouveler` l'utilise réellement.
> ✅ **`entreprises.liste_noire` et `entreprises.bloquer` ne figurent plus dans cette liste** (2026-09-21) : Liste Noire / Bloquer sont de vraies actions (§8.2), avec deux pages dédiées dans le sidebar (« Liste Noire », « Entreprises Bloquées »).

---

## 8. ROUTES API — 179 routes

Préfixe commun : **`/api/v1`**. Tout est sous `auth:sanctum` sauf `POST /auth/login`.
Colonne « Permission » : `admin` = middleware `admin` · `perm:x,y` = middleware de route · `ctrl:x,y` = vérifié **dans le contrôleur**.

### 8.1 Auth et profil (6)

| Méthode | URI | Action | Permission | Rôle |
|---|---|---|---|---|
| POST | `/auth/login` | `AuthController@login` | publique | Connexion (session + cookie) |
| POST | `/auth/logout` | `AuthController@logout` | auth | Déconnexion |
| GET | `/auth/me` | `AuthController@me` | auth | Profil courant — **modèle brut snake_case** |
| PUT | `/profile` | `ProfileController@update` | auth (self) | Modifier son propre compte |
| POST | `/profile/photo` | `ProfileController@uploadPhoto` | auth (self) | Photo de profil |
| DELETE | `/profile/photo` | `ProfileController@deletePhoto` | auth (self) | Supprimer sa photo |

### 8.2 Clients (9) et Entreprises (25)

| Méthode | URI | Action | Permission |
|---|---|---|---|
| GET | `/clients` | `ClientController@index` | `perm:clients,list` |
| POST | `/clients` | `@store` | `perm:clients,create` |
| GET | `/clients/{client}` | `@show` | `perm:clients,list` |
| PUT/PATCH | `/clients/{client}` | `@update` | `perm:clients,update` |
| POST | `/clients/{client}/archive` | `@archive` | `perm:clients,archive` |
| POST | `/clients/{client}/corbeille` | `@corbeille` | `perm:clients,corbeille` |
| POST | `/clients/{client}/restore` | `@restore` | `perm:clients,archive` |
| DELETE | `/clients/{client}` | `@destroy` | `perm:clients,delete` |

**Entreprises : le même schéma de base** sur `/entreprises` avec `perm:entreprises,*`,
**plus 16 routes** (12 pour les blocs Documents et Observations, 4 pour Liste Noire / Bloquer) :

| Méthode | URI | Action | Permission |
|---|---|---|---|
| POST | `/entreprises/{entreprise}/documents` | `@storeDocument` | `perm:entreprises,add_document` |
| GET | `/entreprises/{entreprise}/documents/{document}/download` | `@downloadDocument` | `perm:entreprises,list` |
| POST | `/entreprises/{entreprise}/documents/{document}/archive` | `@archiveDocument` | `perm:entreprises,archive` |
| POST | `/entreprises/{entreprise}/documents/{document}/corbeille` | `@corbeilleDocument` | `perm:entreprises,corbeille` |
| POST | `/entreprises/{entreprise}/documents/{document}/restore` | `@restoreDocument` | `perm:entreprises,archive` |
| DELETE | `/entreprises/{entreprise}/documents/{document}` | `@destroyDocument` | `perm:entreprises,delete` |
| POST | `/entreprises/{entreprise}/observations` | `@storeObservation` | `perm:entreprises,add_observation` |
| GET | `/entreprises/{entreprise}/observations/{observation}/fichiers/{fichier}/download` | `@downloadObservationFichier` | `perm:entreprises,list` |
| POST | `/entreprises/{entreprise}/observations/{observation}/archive` | `@archiveObservation` | `perm:entreprises,archive` |
| POST | `/entreprises/{entreprise}/observations/{observation}/corbeille` | `@corbeilleObservation` | `perm:entreprises,corbeille` |
| POST | `/entreprises/{entreprise}/observations/{observation}/restore` | `@restoreObservation` | `perm:entreprises,archive` |
| DELETE | `/entreprises/{entreprise}/observations/{observation}` | `@destroyObservation` | `perm:entreprises,delete` |

**Plus 4 routes (2026-09-21) pour Liste Noire / Bloquer** — bascule de
`entreprises.situation` (« Normale » par défaut, déjà affichée en liste) :

| Méthode | URI | Action | Permission |
|---|---|---|---|
| POST | `/entreprises/{entreprise}/liste-noire` | `@listeNoire` | `perm:entreprises,liste_noire` |
| POST | `/entreprises/{entreprise}/liste-noire/retirer` | `@retirerListeNoire` | `perm:entreprises,liste_noire` |
| POST | `/entreprises/{entreprise}/bloquer` | `@bloquer` | `perm:entreprises,bloquer` |
| POST | `/entreprises/{entreprise}/debloquer` | `@debloquer` | `perm:entreprises,bloquer` |

> Les deux états sont **mutuellement exclusifs** : `bloquer` écrase un
> « Liste Noire » précédent (et inversement), il n'y a qu'une seule colonne.
> Deux pages sidebar (`/entreprises-liste-noire`, `/entreprises-bloquees`)
> listent les entreprises dans chaque état et permettent d'y revenir à
> « Normale », avec la confirmation « Êtes-vous sûr de vouloir effectuer
> cette action ? » avant chaque bascule. Couverture : `EntrepriseSituationTest`
> (10 tests).

> **Aucune permission nouvelle n'a été créée** : ces routes réutilisent
> `add_document`, `add_observation`, `archive`, `corbeille`, `delete`, qui
> existaient déjà au catalogue du module `entreprises`. Comme partout ailleurs,
> `restore` réutilise `archive`, et `DELETE` renvoie **422** si l'élément n'est
> pas déjà dans la corbeille.
>
> `downloadDocument` est **la seule route du module qui ne renvoie pas une
> `EntrepriseResource`** : elle renvoie le fichier. Elle lit par
> `Storage::disk('public')->download()`, donc elle **ne dépend pas** du lien
> symbolique `public/storage` (§4).
>
> Les **personnes rattachées** (`entreprise_associes`) n'ont pas de routes
> propres : elles font partie du corps de `POST`/`PUT /entreprises` sous la clé
> `associes[]`, remplacée en bloc à chaque enregistrement — exactement comme
> `secteurs[]`.
>
> 🔒 **Observations privées — règle métier validée avec l'utilisatrice :**
> `POST /observations` accepte `privee` (booléen) et `fichiers[]` (jusqu'à
> **10 fichiers**, 5 Mo chacun ; l'envoi passe alors en multipart). Une
> observation cochée privée n'est lisible que par **son auteur et les
> administrateurs**. Ce n'est **pas** un simple marquage visuel :
> `EntrepriseResource` ne la renvoie pas aux autres utilisateurs, les actions
> archive/corbeille/restore/delete répondent **403**, et le téléchargement de
> ses pièces jointes aussi. Le point d'entrée unique de la règle est
> `EntrepriseObservation::estVisiblePar()` — c'est la seule méthode à modifier
> si la règle change. Couverture : 13 tests dans `EntrepriseBlocsTest`.
⚠️ `centreDomiciliation` et `client` sont envoyés **par leur nom** et résolus en ID côté serveur (`EntrepriseController::mapAttributes`). **Conserver ce contrat.**

### 8.3 Domiciliation (15) + Centres (4)

| Méthode | URI | Action | Permission |
|---|---|---|---|
| GET | `/domiciliations` | `DomiciliationController@index` | `perm:domiciliation,list` |
| POST | `/domiciliations` | `@store` | `perm:domiciliation,ajouter` |
| GET | `/domiciliations/{d}` | `@show` | `perm:domiciliation,list` |
| PUT | `/domiciliations/{d}` | `@update` | `perm:domiciliation,ajouter` ⚠️ **pas de clé `modifier` au catalogue** |
| POST | `/domiciliations/{d}/archive` \| `/corbeille` \| `/restore` | `@archive` \| `@corbeille` \| `@restore` | `archive` \| `corbeille` \| `archive` |
| DELETE | `/domiciliations/{d}` | `@destroy` | `perm:domiciliation,supprimer` |
| **POST** | **`/domiciliations/{d}/renouveler`** | `@renouveler` | `perm:domiciliation,renouveler` |
| POST | `/domiciliations/{d}/declarer` | `@declarer` | `perm:domiciliation,gestion` |
| POST | `/domiciliations/{d}/resilier` | `@resilier` | `perm:domiciliation,resilier` |
| **GET** | **`/domiciliations/{d}/operations/{op}/download`** | `@downloadOperationFichier` | `perm:domiciliation,list` |
| POST | `/domiciliations/{d}/observations` | `@storeObservation` | `perm:domiciliation,gestion` |
| POST | `/domiciliations/{d}/documents` | `@storeDocument` | `perm:domiciliation,gestion` |
| DELETE | `/domiciliations/{d}/documents/{doc}` | `@destroyDocument` | `perm:domiciliation,gestion` |
| GET | `/centres-domiciliation` | `CentreDomiciliationController@index` | `perm:domiciliation,centres_list` — **hors groupe admin** (le formulaire Entreprise en a besoin) |
| POST/PUT/DELETE | `/centres-domiciliation[/{centre}]` | `@store` `@update` `@destroy` | **`admin`** — DELETE renvoie **422** si le centre est référencé |

> 🔁 **Renouveler — règle métier.** L'action **crée une NOUVELLE domiciliation**
> pour la même entreprise et le même centre, avec `renouvelle_de_id` pointant
> sur la précédente. **La période d'origine n'est jamais modifiée** : son
> historique reste consultable, elle porte simplement l'opération dans
> `domiciliation_operations`. C'est ce qui distingue « Nouveau » de
> « Renouveler » dans le Calendrier et la Liste des Domiciliations ; pour les
> lignes antérieures à ce lien, le repli reste le rang par date de départ au
> sein d'une même entreprise (`utils/domiciliation.js → classerNouveauRenouveler`).
>
> `renouveler`, `declarer` et `resilier` acceptent tous trois `commentaire` et
> `fichier` (5 Mo), enregistrés dans `domiciliation_operations`. Sans fichier
> l'appel reste en JSON, avec fichier il passe en multipart.
>
> 🖨️ **Documents imprimables.** Les quatre cases `doc_facture`, `doc_contrat`,
> `doc_attestation`, `doc_procuration` ne stockent aucun fichier : elles
> déclarent quels documents font partie du dossier. C'est cette liste que le
> menu « Imprimer » propose, et les quatre modèles sont produits par
> `utils/documentsDomiciliation.js`.

### 8.4 Services (8) et Services En Cours (10)

| Méthode | URI | Action | Permission |
|---|---|---|---|
| GET/POST | `/services` | `ServiceController@index` / `@store` | `perm:services,list` / `,ajouter` |
| GET/PUT/DELETE | `/services/{service}` | `@show` / `@update` / `@destroy` | `list` / `modifier` / `supprimer` |
| POST | `/services/{service}/archive` \| `/corbeille` \| `/restore` | — | `archive` \| `corbeille` \| `archive` |
| GET/POST | `/services-en-cours` | `ServiceEnCoursController@index` / `@store` | `perm:services_en_cours,list` / `,ajouter` |
| GET | `/services-en-cours/activite` | `@activite` | `perm:services_en_cours,list` |
| GET/PUT/DELETE | `/services-en-cours/{s}` | `@show` / `@update` / `@destroy` | `list` / `modifier` / `supprimer` |
| POST | `/services-en-cours/{s}/operations` | `@storeOperation` | `perm:services_en_cours,modifier` — **upload de fichier** |
| POST | `/services-en-cours/{s}/archive` \| `/corbeille` \| `/restore` | — | `archive` \| `corbeille` \| `archive` |

### 8.5 Facturation (9) — une table typée, 4 types

`{type}` ∈ `facture` \| `devis` \| `bl` \| `avoir`. La permission est **construite dans le contrôleur** : `facturation.{action}_{suffixe_du_type}` (ex. `liste_devis`, `archive_bon_livraison`).

| Méthode | URI | Action | Permission |
|---|---|---|---|
| GET | `/facturation/{type}` | `DocumentCommercialController@index` | `ctrl:facturation,liste_*` |
| POST | `/facturation/{type}` | `@store` | `ctrl:facturation,ajouter_*` |
| GET | `/facturation/{type}/numero-propose` | `@numeroPropose` | ctrl — ⚠️ **jamais mis en cache côté front** |
| GET/PUT/DELETE | `/facturation/{type}/{document}` | `@show` / `@update` / `@destroy` | `ctrl:liste_*` / `ajouter_*` / `supprimer_*` |
| POST | `/facturation/{type}/{document}/archive` \| `/corbeille` \| `/restore` | — | `archive_*` \| `corbeille_*` \| `archive_*` |

### 8.6 Paiements (10)

| Méthode | URI | Action | Permission |
|---|---|---|---|
| GET | `/paiements` | `PaiementController@index` | `ctrl:paiements,list_paiements` |
| GET | `/paiements/gestion` | `@gestion` | `ctrl:paiements,gestion_paiements` |
| GET | `/paiements/factures-disponibles` | `@facturesDisponibles` | `ctrl:paiements,list_paiements` |
| POST | `/paiements` | `@store` | `ctrl:paiements,ajouter_paiement` |
| GET | `/paiements/{paiement}` | `@show` | `ctrl:paiements,list_paiements` |
| **POST** | `/paiements/{paiement}` | `@update` | `ctrl:paiements,ajouter_paiement` — **POST car multipart (pièce jointe)** |
| POST | `/paiements/{p}/archive` \| `/corbeille` \| `/restore` | — | `archive` \| `corbeille` \| `archive` |
| DELETE | `/paiements/{paiement}` | `@destroy` | `ctrl:paiements,supprimer` |

> Toute écriture resynchronise `documents_commerciaux.prix_paye` **dans la même transaction** (§13-1).

### 8.7 Mouvements (2)

| Méthode | URI | Action | Permission | Rôle |
|---|---|---|---|---|
| GET | `/mouvements/recu` | `MouvementController@recu` | `ctrl:mouvement,mouvement_entres_recu` | Agrégation des **paiements** |
| GET | `/mouvements/facture` | `@facture` | `ctrl:mouvement,mouvement_entres_facture` | Agrégation des **factures** |

**Aucune table dédiée** : ce sont deux vues d'agrégation.

### 8.8 Déclarations TVA / Chiffre d'Affaire (9)

`{type}` ∈ `tva` \| `chiffre_affaire` → module de permission `declaration` \| `chiffre_affaire` (résolu par `DeclarationTva::MODULES`).

| Méthode | URI | Action | Permission |
|---|---|---|---|
| GET/POST | `/declarations/{type}` | `DeclarationTvaController@index` / `@store` | `ctrl:{module},liste` / `,ajouter` |
| GET/PUT/DELETE | `/declarations/{type}/{declaration}` | `@show` / `@update` / `@destroy` | `liste` / `modifier` / `supprimer` |
| **GET** | `/declarations/{type}/{d}/export/{format}` | `@export` | `ctrl:{module},exporter_{format}` | **ZIP / XML / XLS** (ZIP via `ZipSimple`) |
| POST | `/declarations/{type}/{d}/archive` \| `/corbeille` \| `/restore` | — | `archive` \| `corbeille` \| `archive` |

### 8.9 Rapports (9)

| Méthode | URI | Action | Permission |
|---|---|---|---|
| GET/POST | `/rapports` | `RapportController@index` / `@store` | `ctrl:rapports,list` / `,ajouter` |
| GET | `/rapports/{rapport}` | `@show` | `ctrl:rapports,list` |
| **POST** | `/rapports/{rapport}` | `@update` | `ctrl:rapports,modifier` — **POST car multipart** |
| GET | `/rapports/{rapport}/document` | `@telecharger` | `ctrl:rapports,list` — téléchargement réel |
| POST | `/rapports/{r}/archive` \| `/corbeille` \| `/restore` | — | `archive` \| `corbeille` \| `archive` |
| DELETE | `/rapports/{rapport}` | `@destroy` | `ctrl:rapports,supprimer` |

### 8.10 Cachets (10) et Mails (10)

| Méthode | URI | Action | Permission |
|---|---|---|---|
| GET | `/cachets/activite` | `CachetController@activite` | `ctrl:cashet,list` — fil d'activité |
| GET/POST | `/cachets` | `@index` / `@store` | `ctrl:cashet,list` / `,ajouter` |
| GET/PUT/DELETE | `/cachets/{cachet}` | `@show` / `@update` / `@destroy` | `list` / `modifier` / `supprimer` |
| POST | `/cachets/{cachet}/operations` | `@storeOperation` | `ctrl:cashet,modifier` — **upload de fichier** |
| POST | `/cachets/{c}/archive` \| `/corbeille` \| `/restore` | — | `archive` \| `corbeille` \| `archive` |

⚠️ Le module de permission des Cachets s'écrit **`cashet`** (orthographe de la maquette). **Mails : schéma identique** sur `/mails` avec `ctrl:mails,*`.

### 8.11 Data Center (8) — ✅ module terminé

| Méthode | URI | Action | Permission | Rôle |
|---|---|---|---|---|
| GET | `/data-center` | `DataCenterController@index` | `perm:data_center,list` | Liste **paginée + recherche serveur** (`status`, `page`, `per_page` ∈ 10/25/50/100, `search`) |
| POST | `/data-center` | `@store` | `perm:data_center,ajouter` | Créer une fiche (`StoreDataCenterFicheRequest`) |
| GET | `/data-center/{fiche}` | `@show` | `perm:data_center,list` | Détail |
| PUT | `/data-center/{fiche}` | `@update` | `perm:data_center,modifier` | Modifier (`UpdateDataCenterFicheRequest`) |
| POST | `/data-center/{fiche}/archive` | `@archive` | `perm:data_center,archive` | `status → archive` |
| POST | `/data-center/{fiche}/corbeille` | `@corbeille` | `perm:data_center,corbeille` | `status → corbeille` |
| POST | `/data-center/{fiche}/restore` | `@restore` | `perm:data_center,archive` | `status → actif` (convention `restore` = `archive`) |
| DELETE | `/data-center/{fiche}` | `@destroy` | `perm:data_center,supprimer` | Suppression définitive = **soft delete**, **422** si la fiche n'est pas dans la corbeille |

**Recherche serveur** sur `denomination`, `ice`, `if`, `rc`, `tp` ; tri par `denomination`.

### 8.12 Chat (3)

| Méthode | URI | Action | Permission |
|---|---|---|---|
| GET | `/chat/contacts` | `ChatController@contacts` | `ctrl:chat,list` |
| GET | `/chat/{user}/messages` | `@messages` | `ctrl:chat,list` — 🚨 **GET à EFFET DE BORD : marque les messages comme lus** |
| POST | `/chat/{user}/messages` | `@send` | `ctrl:chat,envoyer` |

### 8.13 Administration — `admin` uniquement (32)

| Méthode | URI | Action |
|---|---|---|
| GET/POST | `/users` | `UserController@index` / `@store` — **réponse camelCase via `UserResource`** |
| GET/PUT/DELETE | `/users/{user}` | `@show` / `@update` / `@destroy` |
| GET | `/permissions` | `PermissionController@index` — catalogue des 148 |
| GET/PUT | `/users/{user}/permissions` | `@showForUser` / `@updateForUser` — matrice d'attribution |
| GET/PUT | `/settings/cabinet` | `CabinetSettingController@show` / `@update` |
| POST/DELETE | `/settings/cabinet/logo` \| `/signature` | upload / reset (4 routes) |
| GET/PUT | `/settings/domiciliation` | `DomiciliationSettingController@show` / `@update` |
| POST/DELETE | `/settings/domiciliation/logo` \| `/signature` | upload / reset (4 routes) |
| GET/POST/PUT/DELETE | `/service-statuses[/{id}]` | `ServiceStatusController` (4) |
| GET/POST/PUT/DELETE | `/cachet-statuses[/{id}]` | `CachetStatusController` (4) |
| GET/POST/PUT/DELETE | `/mail-statuses[/{id}]` | `MailStatusController` (4) |

### 8.14 Récapitulatif — 179 routes

| Groupe | Nb | Groupe | Nb |
|---|---|---|---|
| auth | 3 | rapports | 9 |
| profile | 3 | cachets | 10 |
| clients | 9 | mails | 10 |
| entreprises | **25** | **data-center** | **8** |
| domiciliations | **15** | chat | 3 |
| centres-domiciliation | 4 | users | 5 |
| services | 8 | permissions | 3 |
| services-en-cours | 10 | settings/cabinet | 6 |
| facturation | 9 | settings/domiciliation | 6 |
| paiements | 10 | service-statuses | 4 |
| mouvements | 2 | cachet-statuses | 4 |
| declarations | 9 | mail-statuses | 4 |
| | | **TOTAL** | **179** |

---

## 9. ÉTAT DES MODULES

Légende : ✅ terminé · ⚠️ partiel · ❌ mock / non implémenté

| # | Module | Route(s) React | Tables | État |
|---|---|---|---|---|
| 1 | Dashboard | `/` | — | ⚠️ partiel |
| 2 | Clients | `/clients*` | `parties` + `clients` | ✅ |
| 3 | Entreprises | `/entreprises*` | `parties` + `entreprises` + `entreprise_secteurs` + `entreprise_associes` + `entreprise_documents` + `entreprise_observations` | ✅ |
| 4 | Domiciliation (gestion / liste / formulaire / centres) | `/domiciliation*` | `domiciliations` (+ obs. + docs) | ✅ |
| 5 | Calendrier de domiciliation | `/domiciliation/calendrier` | `domiciliations` | ✅ — **ne lit plus `mockData`** depuis le 2026-09-21 |
| 6 | Chat | `/chat` | `chat_messages` | ✅ |
| 7 | Services | `/services*` | `services` | ✅ |
| 8 | Services En Cours | `/services-en-cours` | `service_en_cours` (+ operations) | ✅ |
| 9 | Facturation (8 pages) | `/facturation/*` | `documents_commerciaux` + `document_lignes` | ✅ |
| 10 | Paiements (3 pages) | `/paiement*` | `paiements` + `paiement_lignes` | ✅ |
| 11 | Mouvements | `/mouvement/recu`, `/facture` | *(agrégation)* | ✅ |
| 12 | Déclaration TVA | `/declaration-tva*` | `declarations_tva` (+ lignes) | ✅ |
| 13 | Chiffre d'Affaire | `/declaration-tva*` | même table, `type=chiffre_affaire` | ✅ |
| 14 | Rapports | `/rapports*` | `rapports` | ✅ |
| 15 | Cachets | `/cachets` | `cachets` + `cachet_operations` | ✅ |
| 16 | Mails | `/mails` | `mails` + `mail_operations` | ✅ |
| 17 | **Data Center** | `/data-center` | **`data_center_fiches`** | ✅ **TERMINÉ** |
| 18 | Archive | `/archive` | *(15 catégories)* | ✅ |
| 19 | Corbeille | `/corbeille` | *(15 catégories)* | ✅ |
| 20 | Paramètres (7 pages) | `/parametres/:section` | settings + statuts | ✅ |
| 21 | Fichiers | `/fichiers` | *(mémoire React)* | ⚠️ volontaire |
| 22 | Notes | `/notes` | *(localStorage)* | ⚠️ volontaire |

**22 modules documentés.**

### 9.1 Dashboard — ⚠️ partiel
- ✅ KPI **Clients actifs** et **Entreprises gérées** (API réelle).
- ✅ Donut **« Répartition des Dossiers »** — comptages réels par statut.
- ✅ **« Services en cours »** et **« Activité Services »** branchés sur `service_en_cours`.
- ❌ **« Analyse de Domiciliation »** reste **vide** : `dashboardTrend` vient de `mockData.js` et est un **tableau vide** → EmptyState honnête (séries Nouveau/Renouveler indéterminables, §17-1).
- ⛔ KPI « Domiciliations en cours » et « Factures impayées » affichent `—` + « Module non implémenté ».
- ℹ️ Le Dashboard demande **8 listes au montage** + 2 pour le Topbar + 1 `auth/me` ; la déduplication de `api/http.js` ramène ces 11 appels applicatifs à **9 requêtes réseau**.

> 🚨 **RÈGLE ABSOLUE :** ne **jamais** réintroduire de chiffres fictifs pour « remplir » un graphique. Un module non implémenté reste **visiblement vide**.

### 9.2 Clients — ✅
CRUD complet, onglets Actifs/Archivés/Corbeille, bouton retour à la liste, **export 4 formats**, restore protégé par `permission:clients,archive`.
🐛 Utilise encore `window.confirm()` natif (cosmétique). ❌ **Pas de test Laravel dédié aux Clients.**

### 9.3 Entreprises — ✅
CRUD, export 4 formats, retour depuis Archive **et** Corbeille, restore protégé. Le sélecteur de centres lit la **vraie table**. Le champ Centre n'apparaît que si `local === 'Contrat de domiciliation'`.

### 9.4 Domiciliation — ✅ sauf calendrier
- ✅ **Gestion** : Situation / Dénomination / N° Archive / Email / Centre / Dates + 8 actions réelles.
- ✅ **Liste par statut** : 4 tableaux Active / Alerte / Déclaré / Expiré (vert / orange / gris / rouge), export par tableau, pagination.
- ✅ **Formulaire** : 9 modes de paiement, Prix Total calculé, impression de facture réelle.
- ✅ **Centres** : liste paginée, Afficher / Modifier / Supprimer (422 si référencé).
- ✅ **Calendrier** : branché sur `/domiciliations` depuis le 2026-09-21 (mini-calendrier, filtres par catégorie, fiche au clic). Plus aucun `mockData`.
- ❌ Archivage d'un **centre** impossible : `centres_domiciliation` n'a ni `status` ni `deleted_at`.

### 9.5 Chat — ✅
Contacts = autres utilisateurs, messages persistés, compteur de non-lus, marquage lu automatique. Protégé par le groupe **`chat`**.

### 9.6 Services / 9.7 Services En Cours — ✅
Services : formulaire conforme (checkbox Via Experts, Maître pré-rempli, Nom, Prix) + cycle complet.
Services En Cours : colonnes STATUS / SERVICES / CLIENT / DÉPART / DERNIÈRE OPÉRATION, **badges issus de `service_statuses`**, fil d'activité avec **fichier joint téléchargeable**.

### 9.8 Facturation — ✅
8 pages (Ajouter + Liste × Facture / Devis / BL / Avoir) sur **une seule table typée**.
- Totaux vérifiés au centime : 2×1000, remise 10 %, TVA 20 % → HT 2000 / Remise 200 / Net 1800 / TVA 360 / **TTC 2160**.
- **Numérotation auto-incrémentée** transactionnelle (`lockForUpdate()`) : le compteur n'avance **que si** le numéro enregistré est celui proposé. Chaque type a son compteur.
- Contrainte **unique (type, numero)**.

### 9.9 Paiements — ✅
3 pages : Ajouter / Gestion / Liste. Référence auto (`#1`, `#2`…), pièce jointe réelle, lignes de service, filtre Responsable + « Toute / Réglé / Non réglé », lignes colorées (vert soldé / ambré sinon).
✅ **Option C opérationnelle** : `documents_commerciaux.prix_paye` resynchronisé sur la somme des paiements **actifs**, dans la même transaction (ajout, modification, archivage/restauration, suppression).

### 9.10 Mouvements — ✅
Deux vues d'**agrégation**, **aucune table dédiée**. Reçu → paiements (Restante/Payé/Total) ; Facturé → factures (Total/HT/Payé). Filtres date, année, **trimestre**.

### 9.11 Déclaration TVA / 9.12 Chiffre d'Affaire — ✅
Une **table typée**, deux groupes de permissions distincts. 13 colonnes exactes, TTC déduit de HT+TVA, boutons **Sauvegarder (Non Déclaré)** / **(Déclarée)**.
✅ **Exports réels ZIP / XML / XLS**. Le Chiffre d'Affaire n'expose que l'export Excel (conforme à son groupe de permissions).

### 9.13 Rapports — ✅
Titre dynamique « Rapport de jour : … », 9 colonnes, upload d'un document (ZIP/RAR pour multi-documents), download réel.
**Total Revenu du jour = Revenu Local + Revenu Externe.** Protégé par le groupe `rapports`.

### 9.14 Cachets / 9.15 Mails — ✅
Cachets : 6 colonnes (STATUS / LIGNES / CLIENT / DÉPART / DERNIÈRE OPÉRATION / ACTIONS), badges issus de `cachet_statuses`, fil d'activité avec fichier téléchargeable.
Mails : identique **sans la colonne LIGNES**, badges issus de `mail_statuses`.

### 9.16 ✅ Data Center — MODULE TERMINÉ (le plus récent)

> **Ce module était « mock » dans les versions précédentes de ce document. Il ne l'est plus.**
> Toute affirmation contraire trouvée ailleurs (commentaires de code, anciennes notes) est **périmée**.

**Backend**

| Élément | Détail |
|---|---|
| Migration | `2026_09_18_120000_create_data_center_fiches_table` — **additive**, exécutée (batch 21) |
| Table | `data_center_fiches` : `denomination`, `ice`, `if`, `rc`, `tp` (les 5 colonnes de la capture image68, dans son ordre), + `status`, `created_by`, `deleted_at`, timestamps ; index `(status, denomination)` ; FK `created_by → users` SET NULL |
| Modèle | `app/Models/DataCenterFiche.php` — **SoftDeletes**, `scopeStatus()`, `$fillable` = denomination, ice, if, rc, tp, status, created_by |
| Contrôleur | `app/Http/Controllers/Api/V1/DataCenterController.php` — 8 actions |
| FormRequests | `StoreDataCenterFicheRequest`, `UpdateDataCenterFicheRequest` |
| API | **8 routes** — détail complet en **§8.11** |
| Permissions | groupe **`data_center`** (IDs 117–122) : `list`, `ajouter`, `modifier`, `archive`, `corbeille`, `supprimer` — **appliquées par middleware de route** ; `restore` réutilise `archive` |
| Tests | **`tests/Feature/DataCenterTest.php` — 19 tests** |

**Table dédiée et non réutilisation d'`entreprises`** : `entreprises` porte les mêmes 5 champs mais est liée à `parties` par la FK composite typée ; y insérer une fiche Data Center créerait aussi une entreprise visible dans le module Entreprises — couplage jamais validé. Décision documentée dans la migration.
**Aucune contrainte d'unicité** sur ICE/IF : la référence montre des lignes avec RC et TP vides.

**Frontend** — [DataCenter.jsx](frontend/src/pages/DataCenter.jsx) + [api/dataCenter.js](frontend/src/api/dataCenter.js)

- 3 onglets **Actifs / Archivés / Corbeille** (boutons de la capture image68).
- `ServerTable` : **pagination serveur** + sélecteur 10/25/50/100 + **recherche serveur** (denomination, ice, if, rc, tp).
- Formulaire inline (`Field`/`Input`/`FormCard`) pour **ajouter** et **modifier**, panneau de **détail**.
- Actions par ligne : Afficher, Modifier, **Archiver**, **Corbeille**, **Restaurer**, **Supprimer définitivement** (via `ConfirmDialog`).
- Gestion explicite du **403** : « Vous n'avez pas la permission de consulter le Data Center. »
- Entrée de sidebar déjà présente dans `navConfig.js` → `/data-center`.
- **Plus aucun `alert()` de démo, plus aucun import de `mockData.js`.**

**Cycle de vie** : `actif → archive → corbeille → suppression définitive (soft delete)`, **422** si l'on tente de supprimer une fiche qui n'est pas dans la corbeille — strictement le cycle standard du projet.

⚠️ **Point non tranché :** le Data Center **n'apparaît pas** comme catégorie dans les pages globales **Archive / Corbeille** (§9.17). Voir **§17, question ouverte n° 6**.

### 9.17 Archive et Corbeille — ✅ (15 catégories)
`pages/Archive.jsx` (exporte aussi `Corbeille`). **15 catégories réelles** : Clients, Entreprises, Domiciliation, Services, Services En Cours, Factures, Devis, BL, Avoirs, Paiements, Déclarations TVA, Chiffre d'Affaire, Rapports, Cachets, Mails.
- Une catégorie sans permission affiche « Accès non autorisé » sans casser la page.
- **Chargement à la demande** avec cache (1 requête au montage).
- Corbeille = Archive + suppression définitive.
- ⚠️ **Data Center absent de ces 15 catégories** bien qu'il ait son propre cycle archive/corbeille → §17-6.

### 9.18 Paramètres — ✅ (7 pages)
Account (+ photo), Bureau de Comptabilité, Centre de Domiciliation (paramètres + CRUD des centres), Services / Cachet / Mail (statuts), Assistance (Users & Permissions, matrice des 148 permissions).
⚠️ **Deux concepts à ne jamais confondre :** `domiciliation_settings` (1 ligne de configuration) ≠ `centres_domiciliation` (11 centres métier).
ℹ️ La note technique sous la matrice a été retirée de l'UI à la demande de l'utilisatrice — **ne pas la réintroduire**.

### 9.19 Fichiers et Notes — ⚠️ volontaire
`Fichiers` : blobs en mémoire React, perdus au refresh. `Notes` : `localStorage` (clé `via-experts:notes`).
**Volontaire et hors référence DOCX** — ne pas « corriger » sans demande.

---

## 10. DONNÉES RÉELLEMENT PRÉSENTES EN BASE

> ⛔ **NE JAMAIS EXÉCUTER `php artisan migrate:fresh`** sur `via_expert_app`.

**Relevé exact du 2026-09-18** (`SELECT COUNT(*)` sur la base de dev) :

| Table | Lignes | Nature |
|---|---|---|
| `centres_domiciliation` | **11** | 🔴 **À PRÉSERVER** — centres métier seedés par la migration |
| `users` | **2** | 🔴 **À PRÉSERVER** — 1 admin + 1 compte non-admin réel |
| `permissions` | **148** | 🔴 À préserver — catalogue |
| `user_permissions` | **123** | 🔴 À préserver — attributions du compte non-admin |
| `parties` | **4** | 🟡 3 clients (dont 1 soft-supprimé) + 1 entreprise |
| `declarations_tva` | **2** | 🟠 **à vérifier avant tout nettoyage** |
| `mails` | **2** | 🟠 **à vérifier avant tout nettoyage** |
| `cachet_statuses` | **2** | 🟠 **à vérifier avant tout nettoyage** |
| `service_statuses` | **1** | 🟠 **à vérifier avant tout nettoyage** |
| `mail_statuses` | **1** | 🟠 **à vérifier avant tout nettoyage** |
| `rapports` | **1** | 🟠 **à vérifier avant tout nettoyage** |
| `cachets` | **1** | 🟠 **à vérifier avant tout nettoyage** |
| `chat_messages` | **1** | 🟠 **à vérifier avant tout nettoyage** |
| **`data_center_fiches`** | **1** | 🟠 **à vérifier avant tout nettoyage** |
| `domiciliations`, `services`, `service_en_cours`, `documents_commerciaux`, `paiements` | **0** | vides |

> 🟠 **Les lignes marquées « à vérifier » n'ont PAS été qualifiées.**
> Ce document **ne décide pas** s'il s'agit de données métier réelles ou de résidus de tests fonctionnels.
> **Le prochain Claude doit demander confirmation à l'utilisatrice AVANT toute suppression.** En cas de doute : ne rien supprimer.

**Rappel : les fichiers de `backend/storage/app/public/` ne sont pas dans cette base — voir §4.**

**Seeders :** `DatabaseSeeder` (compte admin via `firstOrCreate` + appelle le suivant) · `PermissionSeeder` (catalogue complet, **idempotent**).

---

## 11. RÉFÉRENCE DOCX

**Fichier :** `ANALYSE DU PROJET\Analyse du système de comptabilité.docx` (~25 Mo, **90 captures** du système réel `viaexperts.online`).
📍 **Emplacement variable selon la machine** — sur la machine de rédaction : `<Bureau de l'utilisateur>\ANALYSE DU PROJET\`. **Le localiser avant usage**, ne pas supposer un chemin.

C'est la **référence fonctionnelle et visuelle principale**. Extraction (un .docx est un ZIP) :

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($src, $dest)
# Images : <dest>\word\media\image1.png … image90.png
```

| Section | Images |
|---|---|
| Accueil / Dashboard | 1–2 |
| Clients | 3–8 |
| Entreprises | 9–18 |
| Domiciliation (ajout, gestion, liste, **calendrier = 28**, **centres = 29-30**) | 19–31 |
| Chat / Services / Services en cours | 32 / 33 / 34 |
| Facturation (Ajouter **35-36**, Liste **37**) | 35–46 |
| Paiements (Ajouter **47-48**, Gestion **49-50**, Liste **51-52**) | 47–52 |
| Mouvement (Reçu **53-54**, Facturé **55-56**) | 53–56 |
| Déclaration TVA (**57** nouvelle, **60** liste) | 57–61 |
| Chiffre d'affaire (**63** liste) | 62–63 |
| Rapports (**64** ajout, **65** liste) | 64–65 |
| Cachets **66** / Mails **67** / **Data Center 68** | 66–68 |
| Archive **69** / Corbeille **70** | 69–70 |
| Paramètres (Account 71 … Assistance 79–90) | 71–90 |

**Écarts connus référence ↔ projet :**
1. ❌ **Calendrier** (image28) non développé.
2. 🐛 **`centres_domiciliation` n'a ni colonne `email` ni `n_archive`**, alors que les images 29-30 les affichent.
3. ⚠️ Logo/signature stockés mais **jamais utilisés** dans les documents imprimés.

> ✅ **Data Center (image68) n'est plus un écart : le module est implémenté (§9.16).**

---

## 12. TESTS — ÉTAT EXACT

### 12.1 Ce qui existe

| Mesure | Valeur |
|---|---|
| Fichiers de tests | **18** |
| Tests au total | **204** |

Aux 16 fichiers d'origine se sont ajoutés **`EntrepriseBlocsTest`** (13 tests :
associés, documents, observations privées et pièces jointes) et
**`DomiciliationActionsTest`** (10 tests : Renouveler / Déclarer / Résilier).

`tests/Feature/` (17 fichiers) + `tests/Unit/ExampleTest.php` (1) :

| Fichier | Tests | Fichier | Tests |
|---|---|---|---|
| `SettingsTest` | 25 | `MailTest` | 11 |
| **`DataCenterTest`** | **19** | `PaiementTest` | 11 |
| `CorrectionsAuditTest` | 15 | `ServiceChatTest` | 11 |
| `DeclarationTvaTest` | 13 | `RapportTest` | 9 |
| `CachetTest` | 10 | `EntrepriseTest` | 8 |
| `DomiciliationTest` | 10 | `ServiceEnCoursTest` | 8 |
| `FacturationTest` | 11 | `MouvementTest` | 7 |
| `UserPermissionTest` | 11 | `ExampleTest` (Feature + Unit) | 1 + 1 |

❌ **Aucun test Laravel dédié aux Clients.**
❌ **Aucun test automatisé frontend** (ni Vitest ni Playwright).

### 12.2 🔴 Prérequis obligatoire : la base de test

La suite de tests utilise une **base séparée**, déclarée dans `backend/.env.testing` :

```
DB_CONNECTION=mysql
DB_DATABASE=via_expert_app_test
DB_USERNAME=root
DB_PASSWORD=
```

**Cette base doit exister AVANT `php artisan test`** :

```sql
CREATE DATABASE IF NOT EXISTS via_expert_app_test
  CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
```

```powershell
& $MYSQL -uroot -e "CREATE DATABASE IF NOT EXISTS via_expert_app_test CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"
cd backend
& $PHP artisan test
```

> Les tests utilisent `RefreshDatabase` : ils construisent leur schéma dans **`via_expert_app_test`** et **ne touchent jamais** à `via_expert_app`.

### 12.3 État réel des tests — à ne pas embellir

| Moment | Constat |
|---|---|
| Historique (avant le module Data Center) | **162 / 162 passés** — 181 − 19 tests Data Center = 162, l'écart s'explique donc entièrement par le nouveau module |
| Audit du 2026-09-18 | 🔴 **Les tests n'ont pas pu démarrer : la base `via_expert_app_test` n'existait pas sur la machine.** Résultat brut : `SQLSTATE[HY000] [1049] Unknown database 'via_expert_app_test'` → **179 failed / 2 passed**, aucun échec applicatif |
| Remise en marche (2026-09-19) | ✅ **181 passés / 181**. La base `via_expert_app_test` a été créée (commande du §12.2), puis `artisan test` relancé. Les 19 tests Data Center sont donc eux aussi confirmés. |
| Étape du 2026-09-21 (matin) | ✅ **194 passés / 194** — ajout de `EntrepriseBlocsTest` (13 tests : associés, documents, observations privées et pièces jointes) |
| **Dernier état vérifié (2026-09-21)** | ✅ **204 passés / 204**, 28,86 s. Résultat brut relevé : `Tests: 204 passed`. L'écart 194 → 204 vient des **10 tests de `DomiciliationActionsTest`** (Renouveler / Déclarer / Résilier). |

> ⛔ **NE JAMAIS recopier un total de tests sans avoir relancé `artisan test` avec succès.**
> Procédure : créer la base (§12.2) → lancer `artisan test` → **puis seulement** consigner le résultat réel ici.
> Sur un PC neuf, la base de test n'existe pas : la créer est la première étape, sinon les 204 tests échouent tous à la connexion.

### 12.4 Autres vérifications

| Vérification | Résultat 2026-09-21 |
|---|---|
| `npm run lint` | ✅ **0 erreur** (warnings `react(set-state-in-effect)` préexistants, cosmétiques) |
| `npm run build` | ✅ succès (2537 modules, 791 ms) |
| `migrate:status` | ✅ **48 migrations, 0 en attente** |
| `route:list --path=api` | ✅ **175 routes** |

⚠️ **Limite d'automatisation connue :** l'injection de fichier par script ne déclenche pas le `onChange` de React. Les uploads se testent par requête multipart réelle avec les mêmes cookies, ou par test Laravel.

---

## 13. DÉCISIONS MÉTIER VALIDÉES — NE PAS MODIFIER SANS ACCORD

1. **Prix Payé / Prix Restant = option C (HYBRIDE)** : `prix_paye` **stocké** sur `documents_commerciaux` ; « Prix Payer » **saisissable** à la création ; tout ajout/modification/archivage/suppression de paiement **resynchronise** `prix_paye` = somme des paiements **actifs** ; `prix_restant = total_ttc − prix_paye`, **jamais stocké** ; synchronisation **transactionnelle** (`Paiement::synchroniserFacture`).
2. **Permissions individuelles uniquement.** `is_admin` séparé de `user_permissions`. Admin = accès complet. Non-admin = refus par défaut → 403. **Pas de table `roles`.**
3. **Catalogue figé sur la maquette** + les 2 groupes `rapports` et `chat` ajoutés après audit. Ne pas inventer d'autres clés.
4. **`restore` réutilise la permission `archive`** (aucune action `restore` au catalogue) — **y compris Data Center**.
5. **Exclusivité Client/Entreprise** garantie par FK composite typée — ne pas contourner.
6. **Suppression définitive = soft delete.** `forceDelete()` jamais exposé.
7. **Liste Noire et Bloquer sont deux fonctionnalités indépendantes.** Les permissions existent, la fonctionnalité **non**.
8. **Le module Fichiers est indépendant** de Documents/Observations.
9. **Documents + Observations : Client et Entreprise uniquement.** Exception validée : les observations/documents **de domiciliation** ont leurs propres tables.
10. **Services En Cours reste lié aux CLIENTS uniquement** — décision explicite, ne pas ajouter Entreprise sans nouvelle décision.
11. **Cachets et Mails sont liés à `parties`** (Client **ou** Entreprise).
12. **`domiciliation_settings` (configuration) ≠ `centres_domiciliation` (11 centres métier).** Ne jamais fusionner.
13. **Les 11 centres existants doivent être préservés** — jamais recréés ni supprimés automatiquement.
14. **Paramètres → Services / Cachet / Mail = STATUTS uniquement.** Le catalogue métier Services est un module séparé.
15. **Aucune donnée fictive pour masquer un module manquant** (notamment sur le Dashboard).
16. **Une table typée plutôt que des tables jumelles** : `documents_commerciaux` (4 types) et `declarations_tva` (2 types).
17. **Le compteur de numérotation avance** à l'émission d'un document, uniquement si le numéro utilisé est celui proposé.
18. **La note technique sur les modules sans backend a été retirée de l'UI Assistance** — ne pas la réintroduire.
19. **Le Data Center a sa propre table `data_center_fiches`**, et **ne réutilise pas `entreprises`** malgré des colonnes identiques — décision documentée dans la migration 41 (§9.16).

---

## 14. CORRECTIONS D'AUDIT DÉJÀ APPLIQUÉES

Ne pas re-signaler ces points comme ouverts :

| Problème | Correction |
|---|---|
| `restore` Clients/Entreprises sans permission | `permission:clients,archive` / `entreprises,archive` |
| Centres lus depuis `mockData` dans EntrepriseForm/Details | Branchés sur l'API réelle |
| Lecture des centres admin-only | `GET /centres-domiciliation` sorti du groupe admin sous `permission:domiciliation,centres_list` ; écriture toujours admin |
| Archive/Corbeille obsolètes (2 catégories) | **15 catégories réelles** |
| Archive lançant 15 requêtes au montage (HTTP 429) | Chargement à la demande + cache |
| Chat et Rapports sans permissions | Groupes `chat` et `rapports` ajoutés au catalogue |
| Compteurs de numérotation jamais incrémentés | Incrémentation transactionnelle avec `lockForUpdate()` |
| Sidebar : entrées Domiciliation / Paiement incorrectes | 3 entrées Paiement + 5 entrées Domiciliation conformes |
| Dashboard : blocs Services vides | Branchés sur `service_en_cours` |
| **Throttle 60 req/min (HTTP 429)** — 22 requêtes pour UN chargement du Dashboard | Déduplication + cache court des GET dans **`api/http.js` uniquement** → **22 → 9 requêtes** ; limite Laravel **laissée à 60** volontairement |
| **Data Center entièrement mock** | ✅ **Module complet livré** : table, modèle, contrôleur, 8 routes, permissions branchées, page React, 19 tests (§9.16) |

---

## 15. PROBLÈMES CONNUS ENCORE OUVERTS

| # | Description | Module / Fichier | Gravité | Décision métier requise |
|---|---|---|---|---|
| 1 | **Calendrier de domiciliation mock** | `pages/DomiciliationCalendar.jsx` | 🔴 Module manquant | **Oui** (§17-1) |
| 2 | **« Analyse de Domiciliation » vide** | `pages/Dashboard.jsx` | ⚠️ | **Oui** (§17-1) |
| 3 | **`centres_domiciliation` sans `email` ni `n_archive`** (images 29-30 les affichent) | Paramètres / Domiciliation | ⚠️ | Non — migration additive à planifier |
| 4 | **Colonne Email du tableau Domiciliation** prend l'email du **client rattaché** (`entreprises` n'a pas de colonne email) | `DomiciliationResource` | ⚠️ | **Oui** |
| 5 | **Recherche globale** limitée à Clients/Entreprises ; les autres modules ne sont pas indexés | `components/Topbar.jsx` | ⚠️ | Non |
| 6 | **`parametre` : 8 permissions sans effet** (zone admin-only) | Paramètres | ⚠️ | **Oui** |
| 7 | **`domiciliation` sans action `modifier`** — la mise à jour réutilise `ajouter` | `routes/api.php` | ⚠️ | **Oui** |
| 8 | **`window.confirm` non harmonisé** (Clients, Entreprises, Archive) vs `ConfirmDialog` ailleurs | 3 fichiers | 🟢 Cosmétique | Non |
| 9 | **Logo/signature jamais utilisés** dans les documents imprimés | Facturation | ⚠️ | **Oui** |
| 10 | **Archivage d'un centre impossible** (`centres_domiciliation` sans `status`/`deleted_at`) | Domiciliation | ⚠️ | **Oui** |
| 11 | **Aucun test Laravel dédié aux Clients** | Tests | ⚠️ | Non |
| 12 | **`services` vide** → les lignes de facture restent libres tant qu'aucun service métier n'est saisi | Facturation | 🟢 | Non |
| 13 | **Liste Noire / Bloqué** : permissions présentes, fonctionnalité absente | Entreprises | ⚠️ | **Oui** |
| 14 | **Le Dashboard télécharge 6 listes complètes pour n'en lire que `.length`.** Coût résiduel : 9 requêtes par chargement à froid ; un endpoint de comptages le ramènerait à 3 mais poserait une question de permission non tranchée | `pages/Dashboard.jsx` | 🟢 | **Oui** |
| 15 | **`ensureCsrfCookie()` appelé avant CHAQUE écriture** (aller-retour `/sanctum/csrf-cookie` systématique ; route sous `web`, **hors `throttle:api`**) | `api/http.js` | 🟢 | **Oui** — non corrigé volontairement |
| 16 | **Data Center absent des pages Archive / Corbeille** alors qu'il a son propre cycle | `pages/Archive.jsx` | ⚠️ | **Oui** (§17-6) |
| 17 | **Contraintes CHECK déclarées en migration mais absentes de la base de dev** | `parties`, `clients`, `entreprises` | ⚠️ | **Oui** (§17-7) |
| 18 | **Commentaires de code périmés** dans `routes/api.php` et `PermissionSeeder.php` | backend | ⚠️ Risque d'erreur d'analyse | Non — voir §16 |

### mockData encore présent — distinction importante

| Fichier | Verdict |
|---|---|
| `Dashboard.jsx` → `dashboardTrend` | 🟡 **volontaire** — tableau vide → EmptyState honnête |
| `DomiciliationCalendar.jsx` | 🔴 **vrai mock**, module non traité |
| `NotesContext` → `localStorage` | 🟢 volontaire, hors référence |
| `FilesContext` → mémoire React | 🟢 volontaire, hors référence |

**Plus aucun `mockData` dans Clients, Entreprises, Domiciliation (calendrier compris), Services, Facturation, Paiements, TVA, Rapports, Cachets, Mails, Archive et Data Center.**

---

## 16. 🚨 COMMENTAIRES DE CODE PÉRIMÉS — NE PAS SE FIER À EUX

> Le code contient encore des commentaires écrits **avant** l'audit. Ils sont **factuellement faux aujourd'hui**.
> **Ils n'ont volontairement PAS été modifiés** (ce document ne touche à aucun fichier de code).
> **Ce document, et non ces commentaires, fait foi.**

| Fichier | Commentaire périmé | Réalité vérifiée |
|---|---|---|
| `backend/routes/api.php` (~ligne 154) | « Rapports — **aucun groupe `rapports` dans le catalogue des 140 permissions** : protégé par `auth:sanctum` seul » | **FAUX** : le groupe `rapports` existe (IDs 141–146) et `RapportController::autoriser()` appelle `hasPermission('rapports', …)` sur **chaque** action |
| `backend/routes/api.php` (~ligne 207) | « Chat — **aucun groupe `chat` dans le catalogue des 140 permissions** : protégé par `auth:sanctum` seul » | **FAUX** : le groupe `chat` existe (IDs 147–148) et `ChatController::autoriser()` le vérifie |
| `backend/database/seeders/PermissionSeeder.php` (docblock, lignes ~13-17) | « Seules les permissions `clients` et `entreprises` sont réellement appliquées… **les autres modules n'ont pas encore de backend** » | **FAUX** : 15 des 16 groupes contrôlent aujourd'hui de vraies routes. Seul **`parametre`** reste sans effet individuel (zone admin-only) — §7.4 |
| Divers | Références à « **140 permissions** » | **148** permissions depuis l'ajout de `rapports` et `chat` |

➡️ **Si le prochain Claude doit un jour corriger ces commentaires, c'est une tâche à demander explicitement** (elle touche du code, donc hors périmètre d'une mise à jour de documentation).

---

## 17. QUESTIONS OUVERTES — À VALIDER AVEC L'UTILISATRICE

Pour chacune : ce que montre la référence, ce qu'on ignore, ce qui est implémenté. **Ne rien trancher seul.**

1. **Statuts « Nouveau » et « Renouveler »** (calendrier image28, graphique Dashboard image1-2)
   *Référence :* légende à 6 statuts — Nouveau, Renouveler, Alerte, Expiré, Déclaré, Résilié.
   *Inconnu :* le modèle n'en produit que 5 ; **aucun mécanisme de renouvellement n'existe**. La date de placement sur le calendrier n'est pas visible non plus.
   *Implémenté :* rien. Calendrier et graphique laissés vides.

2. **Seuil « Alerte » domiciliation** — aucune capture ne le donne. *Implémenté :* `Domiciliation::JOURS_ALERTE = 30`, une seule constante à changer.

3. **Formule « Solde de Caisse »** (Rapports, image65) — les 4 lignes de référence ont une Dépense à 0, les deux formules possibles donnent le même résultat. *Implémenté :* champ **saisissable**, pré-rempli avec `Montant Restant − Dépense du Jour`.

4. **Rattachement paiement → facture** — aucun sélecteur de facture sur les images 47-48. *Implémenté :* champ **« Facture réglée » facultatif**. Sans rattachement le paiement vit seul ; avec, la facture est synchronisée.

5. **Filtres Mouvement** (image53) — deux libellés « Date Range » identiques. *Implémenté :* interprétés **Année** + **Trimestre**.

6. 🆕 **Data Center dans Archive / Corbeille ?**
   *Fait :* le Data Center possède un cycle complet **archive → corbeille → restore / suppression définitive**, accessible **depuis sa propre page** (3 onglets).
   *Constat :* les pages **globales** Archive et Corbeille listent **15 catégories** et **n'incluent pas** le Data Center.
   *Inconnu :* est-ce **voulu** (le Data Center se gère depuis sa page, comme les Notes/Fichiers) ou est-ce un **oubli** (16e catégorie à ajouter, avec sa permission `data_center,list`) ?
   *Implémenté :* rien de plus. **Décision métier requise — ne pas trancher seul.**

7. 🆕 **Contraintes CHECK absentes de la base de dev**
   *Fait :* les migrations 5, 6 et 8 déclarent `chk_parties_type`, `chk_parties_status`, `chk_clients_type`, `chk_entreprises_type`.
   *Constat :* elles **n'apparaissent pas** dans `SHOW CREATE TABLE` ni dans `information_schema.CHECK_CONSTRAINTS` sur `via_expert_app` au 2026-09-18. La FK composite typée, elle, est bien là.
   *Inconnu :* base restaurée depuis un dump qui ne les portait pas ? Particularité MariaDB 10.4 ? **Conséquence :** une base recréée par `migrate` sur un PC neuf n'aura **pas exactement** le même schéma que la base de dev actuelle.
   *Implémenté :* rien. **À investiguer avant toute conclusion sur l'intégrité des données.**

8. **Données métier ou résidus de tests ?** (§10)
   *Constat :* 12 tables contiennent 1 à 2 lignes (`declarations_tva`, `mails`, `rapports`, `cachets`, `chat_messages`, `data_center_fiches`, statuts…).
   *Inconnu :* données réelles saisies par l'utilisatrice, ou restes de vérifications fonctionnelles ?
   *Implémenté :* rien n'a été supprimé. **Demander avant tout nettoyage.**

9. **Effet fonctionnel de « Bloquer »** sur une Entreprise — bloque la facturation ? la domiciliation ? les deux ? Comportement après restauration depuis la corbeille ? *Implémenté :* rien.

10. **Contenu exact des documents imprimés** — aucune capture du rendu imprimé. *Implémenté :* sortie texte structurée, **sans logo ni signature**.

11. **Émetteur → branding** (Facturation) — l'émetteur détermine la **numérotation** et le **responsable** ; l'usage du logo/signature de l'émetteur dans le document reste **inconnu**.

12. **Pièce jointe sur les opérations Mails** (image67) — aucun fichier visible, contrairement aux Cachets. *Implémenté :* champ **facultatif**, même mécanique que les Cachets.

13. **Formulaires d'ajout Cachets / Mails** — jamais montrés dans la référence, seul le bouton apparaît. *Implémenté :* formulaires minimaux limités aux colonnes réellement affichées.

**13 questions ouvertes.**

---

## 18. TODO TECHNIQUE

Ordre par dépendances techniques et sécurité, **sans jugement métier**.
✅ **Le Data Center est livré — il ne figure plus dans cette liste.**

| # | Module | Tâche | Dépendances | Réf. DOCX | Décision métier ? |
|---|---|---|---|---|---|
| 1 | ~~**Tests**~~ | ✅ **FAIT (2026-09-21)** — base `via_expert_app_test` créée, `artisan test` relancé : **181 / 181 passés** (§12.3). À refaire sur chaque PC neuf. | Aucune | — | Non |
| 2 | ~~Domiciliation~~ | ✅ **FAIT (2026-09-21)** — Calendrier branché sur les vraies domiciliations, Nouveau/Renouveler résolu par enouvelle_de_id | — | image28 | Non |
| 3 | Dashboard | Graphique « Analyse de Domiciliation » | Même dépendance que #2 | image1-2 | **Oui** |
| 4 | Archive/Corbeille | Trancher l'ajout d'une **16e catégorie Data Center** | Module livré | image69-70 | **Oui** (§17-6) |
| 5 | Base de données | Investiguer les **CHECK absents** de la base de dev | Aucune | — | **Oui** (§17-7) |
| 6 | Paramètres | Ajouter `email` et `n_archive` aux centres | Migration additive | image29-30 | Non |
| 7 | Topbar | Élargir la recherche globale aux autres modules | Modules déjà faits | — | Non |
| 8 | Entreprises | **Liste Noire / Bloqué** | Permissions présentes | — | **Oui** |
| 9 | Facturation | Logo/signature dans les documents imprimés | Fichiers déjà en base | — | **Oui** |
| 10 | Domiciliation | Archivage des centres | Migration `status`/`deleted_at` | — | **Oui** |
| 11 | Tests | `ClientTest.php` | Aucune | — | Non |
| 12 | 3 pages | Harmoniser `window.confirm` → `ConfirmDialog` | Aucune | — | Non |

**12 TODO.**

> ✅ Le throttle 60 req/min est **traité** (§14). La limite Laravel a été **laissée à 60** : après réduction du fan-out elle n'est plus atteinte.

---

## 19. RÈGLES IMPÉRATIVES POUR LE PROCHAIN CLAUDE

> **À lire avant d'écrire la moindre ligne de code.**

1. **Le DOCX de référence est la source principale** pour l'UI et les fonctionnalités visibles. L'analyser **avant** de modifier une page.
2. **Ne jamais inventer une fonctionnalité** non justifiée par la référence ou une décision explicite.
3. **Ne modifier QUE ce qui est explicitement demandé.** Aucun refactor global.
4. **Ne pas modifier un module terminé** sans raison directe.
5. **Analyser le code existant avant** de créer une table, une API ou un composant. **Réutiliser** les structures existantes.
6. **Ne pas changer le design global** (couleurs, typographie, identité visuelle).
7. **Ne pas modifier sidebar/navigation** sans demande — et si demandé : `navConfig.js`, **jamais** `Sidebar.jsx`.
8. ⛔ **Ne jamais exécuter `migrate:fresh`.** Migrations toujours additives et non destructives.
9. ⛔ **Ne pas toucher à XAMPP** ni à la configuration Windows. Les extensions `zip` et `gd` sont absentes : **contourner, pas activer**.
10. **Tester réellement** : Frontend → API → Backend → **MySQL**. Une UI qui s'affiche ne prouve rien.
11. **Vérifier les permissions et les 403** pour toute nouvelle route.
12. **Nettoyer les données de test après vérification — mais JAMAIS sans confirmation** quand le statut de la donnée est incertain (§10, §17-8). **Ne jamais supprimer de données métier réelles** (11 centres, utilisateurs, permissions).
13. **En cas d'ambiguïté : ne rien inventer.** Documenter dans « Questions ouvertes » (§17) et continuer sur ce qui est certain.
14. **Signaler explicitement tout problème trouvé**, même dans un module déclaré terminé, même si cela retarde une livraison.
15. **Avant une grosse modification**, vérifier l'impact sur les modules terminés. **Après une correction importante**, relancer tests + lint + build.
16. **Réutiliser les permissions du catalogue** ; ne pas créer de clé si une existe. Pour `restore`, utiliser `archive`.
17. **Ne pas renommer** les clés `create`/`update`/`delete` de `clients`/`entreprises`.
18. **Attention au fan-out d'appels API** : throttle à **60 req/min par utilisateur** (`RouteServiceProvider::configureRateLimiting`, **volontairement conservé**). Préférer le chargement à la demande aux `Promise.all` massifs. **Ne pas neutraliser le cache de `api/http.js`** et **ne pas y ajouter un GET qui écrit en base** sans le déclarer dans `NO_CACHE`.
19. `Field.jsx` n'accepte **pas** de prop `error` — afficher l'erreur en enfant.
20. **Pas de dépôt Git : aucun rollback possible.** Prudence maximale sur les suppressions de fichiers.
21. 🆕 **Ne pas se fier aux commentaires de code périmés** listés en §16.
22. 🆕 **Ne jamais copier le projet sans `backend/storage/app/public/`** (§4), et toujours relancer `php artisan storage:link` sur la machine cible.
23. 🆕 **Ne jamais écrire dans ce document un résultat de test non réellement exécuté** (§12.3).
24. 🆕 **Ne jamais inscrire de mot de passe ou de secret dans ce document.**

---

## 20. FICHIERS IMPORTANTS

### Racine
```
PASSATION_CLAUDE.md          ← CE DOCUMENT (source de vérité pour la reprise)
PASSATION.md                 ← plus ancien, OBSOLÈTE (ne pas s'y fier)
composer.phar                ← Composer local (utilisable si Composer n'est pas installé)
.claude/launch.json          ← configs serveur de dev frontend (ports 5173 et 5180)
```
*Référence externe :* `ANALYSE DU PROJET\Analyse du système de comptabilité.docx` — **emplacement à localiser sur la machine** (§11).

### Backend
```
routes/api.php                             ← TOUTES les routes (161) — ⚠️ commentaires périmés, voir §16
app/Http/Kernel.php                        ← middlewares 'admin' et 'permission'
app/Models/User.php                        ← hasPermission() : LA règle d'autorisation
app/Http/Middleware/EnsureIsAdmin.php
app/Http/Middleware/CheckPermission.php
app/Support/ZipSimple.php                  ← générateur ZIP (extension zip absente)
app/Models/DocumentCommercial.php          ← 4 types + recalculerTotaux()
app/Models/Paiement.php                    ← synchroniserFacture() = option C
app/Models/Domiciliation.php               ← statutAffichage + JOURS_ALERTE
app/Models/DataCenterFiche.php             ← SoftDeletes + scopeStatus
app/Http/Controllers/Api/V1/               ← 24 contrôleurs
app/Http/Requests/                         ← 24 FormRequests
app/Http/Resources/                        ← 8 Resources
database/migrations/                       ← 49 migrations
database/seeders/PermissionSeeder.php      ← CATALOGUE : 16 groupes / 148 permissions ⚠️ docblock périmé (§16)
database/seeders/DatabaseSeeder.php        ← compte admin (contient le mot de passe initial)
tests/Feature/CorrectionsAuditTest.php     ← couvre les corrections d'audit
tests/Feature/DataCenterTest.php           ← 19 tests du module Data Center
backend/.env  /  .env.example  /  .env.testing
backend/storage/app/public/                ← 🔴 FICHIERS HORS BASE (§4)
```

### Frontend
```
src/App.jsx                       ← toutes les routes React (HashRouter)
src/api/http.js                   ← apiFetch / apiUpload / ApiError / API_URL / cache GET / NO_CACHE
src/api/*.js                      ← 20 fichiers, 1 par ressource (dont dataCenter.js)
src/context/AuthContext.jsx       ← session + profil
src/components/navConfig.js       ← SIDEBAR (modifier ici, pas Sidebar.jsx)
src/components/DataTable.jsx      ← + prop rowClassName
src/components/ServerTable.jsx    ← pagination serveur (utilisé par Data Center)
src/components/ExportMenu.jsx     ← export 4 formats
src/components/DocumentList.jsx   ← générique Facturation (4 types)
src/components/DocumentForm.jsx   ← générique Facturation (4 types)
src/utils/exporters.js            ← CSV / Excel / impression réelle
src/pages/DataCenter.jsx          ← module Data Center (terminé)
src/pages/Archive.jsx             ← Archive ET Corbeille (export nommé Corbeille) — 15 catégories
src/pages/Parametres.jsx          ← LES 7 PAGES + PERMISSION_GROUPS (matrice)
src/data/mockData.js              ← ⚠️ résiduel (Dashboard « Analyse de Domiciliation » uniquement)
frontend/.env                     ← VITE_API_URL
```

---

## 21. COMMANDES UTILES

> Définir d'abord `$PHP` et `$MYSQL` selon la machine (§2.0).

```powershell
# --- Backend ---
cd backend
& $PHP artisan serve --port=8000
& $PHP artisan migrate --force
& $PHP artisan db:seed --class=PermissionSeeder --force
& $PHP artisan storage:link
& $PHP artisan route:list --path=api
& $PHP artisan migrate:status
& $PHP artisan test                      # ⚠️ exige via_expert_app_test (§12.2)

# --- Frontend ---
cd frontend
npm install
npm run dev
npm run lint
npm run build

# --- MySQL ---
& $MYSQL -uroot via_expert_app -e "SHOW TABLES;"
& $MYSQL -uroot -e "CREATE DATABASE IF NOT EXISTS via_expert_app_test CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"

# --- Sauvegarde AVANT transfert ---
& "$(Split-Path $MYSQL)\mysqldump.exe" -uroot via_expert_app > dump_via_expert_app.sql
#   + copier backend\storage\app\public\  (§4)

# --- Contrôles rapides de cohérence ---
& $MYSQL -uroot via_expert_app -e "SELECT COUNT(*) FROM permissions;"           # attendu 148
& $MYSQL -uroot via_expert_app -e "SELECT COUNT(*) FROM centres_domiciliation;" # attendu 11
```

---

## 22. HISTORIQUE — ORDRE DE DÉVELOPPEMENT

| Étape | Module | Décisions prises |
|---|---|---|
| 1 | Fondations, Auth, Clients, Entreprises, Users/Permissions | FK composite typée ; permissions individuelles ; soft delete |
| 2 | Archive/Corbeille v1, Dashboard partiel | Aucune donnée fictive |
| 3 | Paramètres (7 pages) | `domiciliation_settings` ≠ `centres_domiciliation` |
| 4-5 | Uploads logo/signature, photo de profil, statuts Cachet/Mail | Sidebar pour les 7 pages Paramètres |
| 6 | Catalogue élargi à 140 permissions *(→ 148 aujourd'hui)* | Clés `create/update/delete` conservées |
| 7 | Dashboard KPI, exports Clients/Entreprises, recherche globale | Export réel 4 formats ; PDF via impression |
| 8 | Domiciliation métier, Services, Chat | Statut d'affichage calculé ; `JOURS_ALERTE = 30` |
| 9 | Services En Cours | Les statuts des Paramètres alimentent une page métier |
| 10 | Facturation (8 pages) | Table typée ; **option C validée** |
| 11 | Paiements | Synchronisation transactionnelle de `prix_paye` |
| 12 | Mouvements | Vues d'agrégation, aucune table |
| 13 | TVA + Chiffre d'Affaire | Table typée ; `ZipSimple` créé |
| 14 | Rapports | Revenu du jour = Local + Externe |
| 15 | Cachets, puis Mails | Réutilisation de `cachet_statuses` / `mail_statuses` |
| 16 | Audit complet + corrections | 9 problèmes corrigés ; groupes `rapports` et `chat` ajoutés |
| 17 | Correction du throttle (HTTP 429) | Déduplication + cache court des GET dans `api/http.js` **seul** |
| 18 | ✅ **DATA CENTER — module complet (travail le plus récent)** | **Table dédiée `data_center_fiches`** plutôt que réutilisation d'`entreprises` ; **migration 41 additive** ; 8 routes sous `permission:data_center,*` ; `restore` réutilise `archive` ; suppression définitive = soft delete + 422 hors corbeille ; page React avec pagination/recherche serveur ; **19 tests** (162 → **181**) |
| 19 | 📄 **Mise à jour de cette passation (2026-09-18)** | Compteurs réels, section installation PC neuf, checklist de transfert, fichiers hors base, base de test, tableau des 175 routes, schéma DB détaillé, commentaires périmés signalés. **Aucun fichier de code modifié.** |
| 20 | 🎨 **Refonte du design (2026-09-19)** | Reprise du gabarit de la maquette de référence : jeu de tokens réécrit dans `index.css` en **conservant les noms historiques** (aucune page à retoucher), design system `components/ui/`, `DataTable`/`ServerTable` devenus des enveloppes de `Table.jsx` **à API inchangée**, sidebar sombre repliable, topbar flottante avec bandeau d'alerte d'échéance, Dashboard à 2 graphiques et 6 périodes calculées sur de vraies dates |
| 21 | 🗄️ **Fiche entreprise (2026-09-19) — blocs manquants** | La maquette montre une **liste** de personnes rattachées (nom / CIN / rôle), un bloc **Documents** et un bloc **Observations** avec historique : le modèle n'avait qu'**un** `client_id` sans rôle et **un** champ texte `observation`. Décision validée avec l'utilisatrice : **3 tables neuves** (`entreprise_associes`, `entreprise_documents`, `entreprise_observations`), **migrations purement additives**, colonnes historiques conservées. Rôles figés à **5 valeurs** (`EntrepriseAssocie::TYPES`). `domiciliations.created_at` / `created_by` exposés pour les colonnes « Date d'ajout » / « Ajouter par ». **11 routes** réutilisant des permissions existantes — aucune permission créée |
| 22 | ✅ **Suite de tests remise en marche (2026-09-19)** | Base `via_expert_app_test` créée, `artisan test` relancé : **181 / 181 passés**. Le TODO n° 1 de §18 est soldé |
| 23 | 🔒 **Observations : pièces jointes et confidentialité (2026-09-21)** | Deux ajouts demandés sur les fenêtres de la Liste des Entreprises. **Nom du document** : simple champ, déjà accepté par l'API. **Observation** : plusieurs pièces jointes et case « privée ». Deux questions de conception tranchées par l'utilisatrice — (a) visibilité d'une observation privée = **auteur + administrateurs**, appliquée côté serveur via `EntrepriseObservation::estVisiblePar()`, pas un simple badge ; (b) **plusieurs fichiers** par observation, donc table dédiée `entreprise_observation_fichiers` plutôt que des colonnes `fichier_*`. Migrations additives (45, 46). **13 tests** ajoutés (181 → **194**) |

| 24 | 🔁 **Module Domiciliation complété (2026-09-21)** | **Renouveler** devient une vraie action métier : nouvelle période liée par `renouvelle_de_id`, l'ancienne conservée (permission `renouveler`, présente au catalogue mais jamais branchée jusqu'ici). **Déclarer / Résilier** acceptent commentaire + justificatif, journalisés dans `domiciliation_operations`. **« Imprimer »** propose les documents cochés sur la domiciliation (Facture, Contrat, Attestation, Procuration) via `utils/documentsDomiciliation.js`. **Prix Par Mois** repris de la fiche Service « Domiciliation » au lieu d'être codé en dur, **Date de Fin** calculée (départ + Payée + Gratuits, avec bornage de fin de mois). « Informations Client » et « Informations Domiciliation » reprennent le gabarit de « Informations Entreprise » (`components/FicheInfos.jsx`, `FicheDomiciliation.jsx`). **Liste des Domiciliations** et **Calendrier** refaits d'après les captures. **10 tests** ajoutés (194 → **204**) |
| 25 | ✅ **Corrections Accueil / Client / Entreprise / Domiciliation (2026-09-21, suite)** | **Accueil** : bug résolu — le bandeau `overflow-hidden` de `Topbar.jsx` rognait silencieusement TOUS les popovers (Fichiers/Notes/Calculatrice/TVA/Notifications/Profil/recherche), d'où « les icônes ne marchent pas » ; donut Expense Ratio retouché (parts espacées, étiquette centrale hiérarchisée, pourcentage masqué sous 6 % pour éviter le chevauchement) ; l'auteur réel d'une opération de service n'est plus affiché, remplacé par « Via Experts » partout. **Client** : champs arabes retirés du formulaire (colonnes conservées) ; Liste alignée sur le modèle Entreprise (Export → Archive → Corbeille, sans bouton intermédiaire ; menu Afficher/Archiver/Supprimer) ; nouvelle page **Informations Client** au gabarit `Informations Entreprise`, avec bloc Entreprise (nouvelle relation `Client::entreprises()`) et Documents/Observations/Domiciliation de cette entreprise. **Entreprise** : bloc « Nom du Client / C.I.N / Type » retiré du formulaire de CRÉATION (conservé en modification) ; Date de Fin de la section « Ajouter Domiciliation » désormais calculée ; prix relabellisés **HT** ; **Liste Noire / Bloquer** enfin branchés (`entreprises.situation`, 4 routes, permissions déjà au catalogue) avec confirmation obligatoire, plus deux pages sidebar dédiées. **Domiciliation** : le bouton « + » du bloc Domiciliation devient **Renouveler** (icône et action) sur `Informations Entreprise`, `Informations Client` et `Informations Domiciliation` (`FicheDomiciliation.jsx`), réutilisant exactement `FormulaireRenouvellement` + `POST /domiciliations/{d}/renouveler`. Composants extraits pour partage : `components/CarteBloc.jsx`, `components/StatusBadge.jsx` (tons Liste Noire/Bloqué). **4 routes** ajoutées, **10 tests** ajoutés (204 → **214**) |
| 26 | 🐛 **Bug critique de saisie + parité Client/Entreprise (2026-09-22)** | **Bug résolu — la vraie cause du « ça s'arrête après une lettre » dans Ajouter Observation** : `ui/Modal.jsx` avait `onClose` dans le tableau de dépendances de son `useEffect` de focus. Comme `onClose` est presque partout une fonction fléchée EN LIGNE (`onClose={() => setX(false)}`), chaque frappe faisait re-rendre le parent → nouvelle référence `onClose` → l'effet se rejouait → le `setTimeout` de focus initial replaçait le curseur sur le PREMIER élément focusable du panneau (le bouton « X », avant le contenu), pas sur le champ en cours de saisie. Corrigé une fois pour toutes dans `Modal.jsx` via `onCloseRef` (l'effet ne dépend plus que de `open`) : le bug est réglé pour CETTE modale et pour toute autre modale de l'application qui pourrait avoir le même symptôme, sans toucher aux dizaines d'appelants. **Parité Client ↔ Entreprise** : les blocs Documents/Observations/Domiciliations d'« Informations Client » n'avaient ni colonne ACTION ni boutons Archive/Corbeille — extraction de `components/BlocsEntreprise.jsx` (les trois blocs + toutes leurs actions : ajout, archiver, mettre à la corbeille, restaurer, supprimer définitivement, renouveler, imprimer), désormais **partagé tel quel** entre `EntrepriseDetails.jsx` et `ClientDetails.jsx` — une seule implémentation, donc plus aucun risque de désynchronisation entre les deux pages. **« Créé par »** : nouvelle colonne `parties.created_by` (commune à Client et Entreprise, migration 49), affichée dans « Détail de création » sur Informations Client et Informations Entreprise ; Informations Domiciliation l'affichait déjà (`domiciliations.created_by`, inchangé). **4 tests** ajoutés (214 → **218**) |

| 27 | 🗂️ **Formulaire Client réorganisé + Archive/Corbeille ne quittent plus la page (2026-09-22, suite)** | **Formulaire Client** : depuis le retrait des champs arabes, trois cases restaient vides (`<div className="hidden sm:block" />`) à côté de Genre, Nom Complet et Adresse — grille réorganisée en paires cohérentes (Genre/Nationalité, Nom/Date de Naissance, C.I.N.E/Email, Téléphone/Téléphone 2), Adresse en pleine largeur, plus aucune case vide. **Archive / Corbeille sur Informations Client et Informations Entreprise** : les deux boutons appelaient bien l'API, mais renvoyaient ensuite vers la LISTE (`navigate('/entreprises')` / `navigate('/clients')`), ce qui donnait l'impression que « ça ne marche pas » puisque les blocs Documents/Observations/Domiciliations disparaissaient avec la page. Les deux pages restent maintenant sur place après l'action : badge et bandeau reflètent le nouveau statut (Active/Archivée/Corbeille), un bouton **Corbeille** a été ajouté à côté d'Archive (il manquait), et un bouton **Restaurer** apparaît dès que la fiche n'est plus active — les trois blocs restent visibles et pleinement fonctionnels dans tous les cas, exactement ce qui était demandé. |

**Prochain chantier prévu :** les points ouverts de §17 (statuts de services, lien `public/storage`) restent à trancher. Une capture de référence pour le formulaire de renouvellement est encore attendue (§4 de la demande du 2026-09-21) : reproduire son design exact dès réception.

---

## 23. PROMPT DE REPRISE — à copier-coller dans un nouveau chat Claude Code

```
Lis entièrement le fichier PASSATION_CLAUDE.md situé à la racine du projet, avant
toute modification.

Analyse ensuite l'état actuel du projet (backend Laravel + frontend React) et
vérifie que la réalité du code correspond à ce que décrit ce document.

NE MODIFIE RIEN pour l'instant. Aucune écriture de fichier, aucune migration,
aucune commande qui change la base.

Confirme-moi que tu as compris :
1. l'architecture frontend + backend et la stack (versions)
2. la structure de la base de données (48 migrations, 41 tables, FK, statuts,
   soft deletes)
3. le système d'authentification Sanctum SPA et sa configuration
4. le système de permissions (148 permissions, 16 groupes, règle hasPermission,
   convention restore = archive, permissions sans effet réel)
5. l'état réel de chaque module, en particulier que le Data Center est TERMINÉ
   et que le Calendrier de domiciliation reste mock
6. les décisions métier déjà validées, à ne pas remettre en cause
7. les TODO prioritaires
8. les questions ouvertes non tranchées
9. les commentaires de code périmés listés en §16, dont il ne faut pas tenir compte
10. les règles impératives de §19

Signale-moi immédiatement toute contradiction entre le document et le code réel.

Ensuite, attends mes instructions.
```

---

*Document vérifié et mis à jour le **2026-09-22** par un audit réel : `migrate:status` (49 migrations, 0 en attente), `route:list --path=api` (179 routes), `SHOW TABLES` (41), `information_schema` (colonnes, FK, index uniques), `artisan test` (**218 / 218 passés**), `npm run lint` (0 erreur), `npm run build` (succès), lecture des sources backend et frontend, relevés MySQL de toutes les tables métier.*

*L'audit initial du 2026-09-18 n'avait modifié aucun fichier de code. Les mises à jour des 2026-09-19 et 2026-09-21 reflètent en revanche du **code réellement livré** : 7 migrations additives, 5 modèles, 14 routes, 23 tests, et le branchement frontend correspondant (§22, lignes 20 à 24).*
