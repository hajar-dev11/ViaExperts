# Phase 0 — Sécurisation avant la migration Modular Monolith

Date : 2026-10-05 · Aucune logique métier, aucun fichier existant, aucune base de données n'a été modifié.

## État de référence (baseline)

| Élément | Valeur |
|---|---|
| Commit de référence | `fda5dd7` (« Initial commit »), branche `main`, arbre propre |
| Tag Git de sauvegarde | `baseline-avant-modular-monolith` → `git checkout baseline-avant-modular-monolith` pour revenir à cet état |
| Tests backend (avant Phase 0) | 244 tests : **243 réussis, 1 échec connu** (voir ci-dessous) |
| Tests backend (après Phase 0) | 247 tests : 246 réussis, 1 échec connu (+3 instantanés) |
| Build frontend | `npm run build` OK |
| Lint frontend | 0 erreur, 45 avertissements (déjà présents) |
| Tests frontend (nouveaux) | 35 tests Vitest, 32 instantanés |
| Base de développement | `via_expert_app` (MySQL, 43 tables, 61 migrations). Les tests utilisent `via_expert_app_test` (`.env.testing`) : la base de développement n'est jamais touchée par les tests. |

## Test en échec connu (antérieur à la Phase 0, non corrigé volontairement)

`Tests\Feature\ServiceChatTest::test_empty_message_is_rejected`

- Le test envoie `POST /api/v1/chat/{user}/messages` avec `body = ''` et attend une **erreur de validation sur la clé `body`** (`assertJsonValidationErrors(['body'])`).
- Le contrôleur (`ChatController::send`) accepte désormais un message **sans texte s'il contient un fichier** (`body` est `nullable`). Quand il n'y a ni texte ni fichier, il rejette avec `abort_if(..., 422, 'Un message ou un fichier est requis.')`, c'est-à-dire un **422 avec un champ `message`**, pas une erreur sur `body`.
- Conclusion : **ce n'est pas un bug fonctionnel**. Le message vide est bien refusé (422). Le test est simplement obsolète depuis l'ajout de l'envoi de fichiers dans le chat.
- Correction recommandée (à faire hors migration, en le validant avec vous) : adapter l'assertion du test à `->assertStatus(422)->assertJsonPath('message', 'Un message ou un fichier est requis.')`.
  Alternative : valider `body` avec `required_without:fichier` dans `ChatController`.

## Filets de non-régression créés

### Backend (`php artisan test --filter=Snapshot`)

| Fichier | Rôle |
|---|---|
| `tests/Feature/Snapshots/RoutesSnapshotTest.php` | Fige les 205 routes de l'API (méthode, URI, nom, middleware, `Contrôleur@méthode`, dans l'ordre) → `tests/Snapshots/routes.json` |
| `tests/Feature/Snapshots/PermissionsSnapshotTest.php` | Fige le catalogue de permissions créé par `PermissionSeeder` → `tests/Snapshots/permissions.json` |
| `tests/Feature/Snapshots/ApiShapeSnapshotTest.php` | Fige le code HTTP et la **forme** (clés + types) du JSON de 48 endpoints → `tests/Snapshots/api-shapes.json` |
| `tests/Support/Snapshot.php` | Utilitaire de comparaison (« golden files ») |

Régénération volontaire (après un changement assumé) : `UPDATE_SNAPSHOTS=1 php artisan test --filter=Snapshot`, puis relire le diff Git.
Dans `routes.json`, seul le **nom court** du contrôleur est comparé : déplacer un contrôleur dans un module ne casse pas le test, mais changer une URL, un middleware ou une permission le casse.

### Frontend (`npm test`)

| Fichier | Rôle |
|---|---|
| `vitest.config.js` | Configuration Vitest (séparée de `vite.config.js`) |
| `src/__tests__/documents.snapshot.test.js` | Instantanés exacts du HTML/CSS des documents : facture, devis, bon de livraison, avoir (avec/sans cachet), facture de domiciliation, reçus A4/A5, attestation, contrat (+ QR dynamique), procuration (+ civilité, date) |
| `src/__tests__/__snapshots__/documents.snapshot.test.js.snap` | Références (générées) |

Mise à jour volontaire : `npm test -- -u`, puis relire le diff Git.

## Sauvegarde

Dossier : `C:\Users\hajar\Backups\ViaExperts\2026-10-05_phase0_avant-modular-monolith\` (hors du projet)

- `via_expert_app.sql` — dump complet de la base (43 tables)
- `storage_app_public.zip` — fichiers téléversés (32 fichiers)
- `backend.env.copie` — copie du `.env` (contient `APP_KEY`, ne pas partager)
- `LISEZ-MOI.txt` — procédure de restauration

## Retour en arrière

- Code : `git checkout baseline-avant-modular-monolith` (ou `git revert` du commit de la Phase 0).
- Base : `C:\xampp\mysql\bin\mysql.exe -u root via_expert_app < via_expert_app.sql`
