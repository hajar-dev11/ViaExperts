# Audit global fonctionnel, performance et production — Via Experts (étape 23)

Date : 6 octobre 2026. Point de départ : `a2ef616` (tag `post-security-hardening`). Aucune mise à jour de PHP, Laravel ni Composer ; `composer.json` et `composer.lock` non modifiés ; aucun déploiement ; aucun push.

## 0. Méthode et limites

- **Environnement d'audit isolé** : base MySQL temporaire `via_expert_app_audit` (créée puis supprimée), schéma migré, jeu de démonstration (`DemoDataSeeder`) + un administrateur de test créé pour l'occasion ; API sur `localhost:8010`, frontend (Vite) sur `localhost:5199`, cookies, CORS et Sanctum configurés pour ce couple de ports. Aucun compte réel n'a été utilisé ; la base réelle (`via_expert_app`) et le serveur de développement du port 8000 n'ont pas été touchés (8 utilisateurs et 32 fiches avant et après).
- **Preuves** : navigateur intégré (parcours réels, requêtes réseau, console), sondes exécutées contre la base d'audit, et suites de tests. Une fonctionnalité n'est marquée « OK » que si elle a été exercée ou couverte par un test qui passe.
- **Limites** : le navigateur intégré n'ouvre pas de nouvel onglet PDF ni de boîte d'impression ; les comportements propres à LWS (§ ⚪) ne peuvent pas être testés ici ; les données d'audit sont petites (sauf essai de charge ponctuel).
- **Effets de bord sur le poste** : le fichier `storage/logs/laravel.log` (ignoré par Git) contient les e-mails de test de l'audit (compte de test uniquement). Les fichiers téléversés pendant l'audit ont été supprimés (vérifié : aucun fichier récent dans `storage/app/public`).

## 1. Résumé

| | |
|---|---|
| Bugs critiques (P0) | **0** |
| Bugs importants (P1) corrigés | **1** (paiements simultanés → erreur 500) |
| Défauts mineurs (P2) corrigés | **3** (affichage des dates de factures, date par défaut d'un rapport, message 403 des rapports) |
| Décisions à prendre avant mise en ligne | **3** (fuseau horaire, surpaiement, montée PHP/Laravel) |
| Verdict | **READY WITH RESERVES** |

## 🟢 Ce qui fonctionne (avec preuves)

**Authentification — workflow complet, bout en bout dans le navigateur** : demande de lien → e-mail généré → lien → formulaire → nouveau mot de passe → ancien mot de passe refusé → connexion avec le nouveau.
- Message neutre à la demande ; jeton de 64 caractères ; lien construit sur `FRONTEND_URL` (route `#/reset-password`) ; validation côté client (8 caractères minimum) ; **lien déjà utilisé refusé** (« invalide ou expiré »).
- **Le « problème » du mot de passe oublié en local vient uniquement de `MAIL_MAILER=log`** : l'e-mail est bien construit et « envoyé » dans `storage/logs/laravel.log` ; ce n'est pas un bug applicatif. Il fonctionnera dès que le SMTP réel est configuré (envoi réel à vérifier sur LWS, ⚪).
- Limitation de débit : 5 échecs → blocage « Réessayez dans N secondes » affiché dans l'interface ; le blocage expire ; session expirée → redirection automatique vers la connexion ; rechargement d'une page profonde (`F5`) conserve la session.
- 23 tests automatisés d'authentification (jeton invalide / expiré / mauvais e-mail, CSRF 419, CORS, session).

**Parcours de toutes les pages** (60 routes, dont toutes les routes dynamiques avec de vrais identifiants) : **aucune erreur HTTP 4xx/5xx, aucune exception JavaScript, aucune page vide**. Formulaires de création et de modification chargent leurs données après un rechargement complet. Mobile (375 px) : aucun débordement horizontal sur 7 pages testées.

**Droits d'accès** : compte restreint (clients + entreprises) → chaque module non autorisé affiche un message de permission en français et l'API répond 403 ; sections de Paramètres réservées à l'administrateur affichent « Section réservée à l'administrateur ». Un parcours automatique vérifie que **toutes** les routes de l'API (hors login / mot de passe oublié) répondent 401 sans connexion.

**Écritures** (exercées réellement) : création d'une facture par le formulaire (201) ; paiements sur facture (le prix payé et le reste se recalculent) ; notes (création, modification, suppression) ; fichiers (téléversement d'un PDF au nom accentué, suppression → fichier supprimé du disque) ; signature (téléversement, intégration dans l'identité du PDF, suppression) ; téléversement d'un faux PNG contenant du PHP **refusé (422)**. Écritures vides sur 59 routes : 0 erreur 500, aucune donnée perdue (lignes de factures, paiements, déclarations intactes).

**Robustesse** : 3 jeux de paramètres d'URL hostiles (`'`, `%`, `OR 1=1`, `DROP TABLE`, dates invalides, `per_page` négatif ou énorme) sur toutes les routes de lecture : 0 erreur 500, table des utilisateurs intacte. CORS : seule l'origine configurée est acceptée, avec cookies.

**PDF et impression** (génération réelle dans le navigateur) :
- Facture A4 : PDF valide (`%PDF-1.3`), 1 page, 286 Ko ; contenu vérifié visuellement et chiffres recoupés (2 lignes 4 500 Dh HT + TVA 20 % 900 = 5 400 Dh TTC, « CINQ MILLE QUATRE CENTS DIRHAMS », dates 06/05/2026 et 05/06/2026, mode de paiement, reste à payer).
- Reçu de paiement A4 (294 Ko) et A5 (145 Ko) : 1 page chacun.
- **5 générations successives** : 284 ms puis ~140 ms, mémoire stable, aucune iframe laissée dans la page. Un clic sur « Imprimer » ne produit aucune erreur.
- 32 snapshots HTML des documents (facture, devis, BL, avoir, reçu, attestation, contrat, procuration, facture de domiciliation) inchangés.

**Performance serveur** (jeu de démonstration, 56 routes de lecture) : toutes < 40 ms ; nombre de requêtes SQL constant (≤ 18) ; pas de N+1. Pages : 0 à 5 requêtes API par page ; aucun polling ; mise en cache de 10 s des GET identiques ; 60 requêtes/min par utilisateur jamais approchées.

**Concurrence** : 14 tests de numérotation + 2 tests à vrais processus (6 processus simultanés : aucun doublon, compteur exact) ; **nouveau** test à vrais processus pour les paiements (voir § 🔴).

**Compatibilité Linux** : 196 classes PHP vérifiées (casse des chemins PSR-4) et 632 imports frontend : aucun problème de casse (seul faux positif connu : un commentaire de `components/ui/index.js`).

**Tests finaux** : voir § 7.

## 🔴 Ce qui était cassé

### P1 — Paiements simultanés : erreur 500 (CORRIGÉ)
- **Reproduction** : 6 processus enregistrant des paiements sur la même facture au même instant → **22 requêtes sur 30 en erreur 500** (sondage) et 19 sur 24 dans le test. Causes : la référence `#N` est calculée par `max(id)+1` sans verrou (violation de `paiements_reference_unique`), puis interblocages MySQL (« Deadlock found ») entre l'insertion et la resynchronisation de la facture.
- **Impact** : deux utilisateurs qui enregistrent un paiement au même moment (ou un double clic) reçoivent « erreur serveur » ; aucune donnée corrompue (contrainte unique) mais un paiement saisi est perdu.
- **Correction** (`PaiementController::store`) : création en exclusion mutuelle par verrou nommé MySQL (`GET_LOCK`, relâché dans un `finally`, erreur 503 explicite si le verrou n'est pas obtenu en 20 s) ; la pièce jointe est stockée avant la section critique. Format de référence, API et règles métier inchangés.
- **Preuve** : `PaiementConcurrenceTest` (6 processus × 4 paiements) échouait avant la correction, passe après (24/24 créés, 0 erreur, références uniques, prix payé = somme exacte) ; relancé 4 fois sans faille. Les 32 tests de paiements et de mouvements passent.

### P2 — Dates des listes de factures, devis, BL, avoirs (CORRIGÉ)
`2026-05-06 00:00:00` affiché dans la colonne « Date Facturation » (l'API renvoie un datetime pour une date saisie sans heure). Affichage désormais `06/05/2026` ; le tri et les exports conservent la valeur brute.

### P2 — Date par défaut d'un nouveau rapport (CORRIGÉ)
`toISOString()` donnait la date **UTC** : entre minuit et 1 h (UTC+1) le formulaire proposait la veille. Utilise désormais `aujourdhui()` (date locale), comme les autres formulaires.

### P2 — Liste des rapports sans droit (CORRIGÉ)
Affichait « Impossible de charger les rapports » (message générique) ; affiche maintenant le message de permission comme les autres modules.

Tests de non-régression ajoutés côté frontend : `corrections-audit.test.js` (5 tests) ; la liste des consommateurs de `shared/utils/date.js` dans `domiciliation-frontend.test.js` inclut désormais `pages/Rapports.jsx` (changement volontaire de ce garde-fou).

## 🟠 Risques avant déploiement (non corrigés : décisions ou hors périmètre)

| # | Gravité | Constat | Pourquoi je n'ai pas corrigé |
|---|---|---|---|
| 1 | **P1 — décision** | **Fuseau horaire** : `app.timezone = UTC`, alors que le Maroc est en UTC+1. Les horodatages créés par le serveur (dernière opération, créations…) sont en UTC ; `date_depart` des cachets et courriers est envoyé en UTC par le navigateur (affiché avec 1 h de retard : 11:10 au lieu de 12:10 sur le poste de test), alors que « Services en cours » envoie l'heure locale. Les colonnes d'une même ligne sont donc incohérentes entre modules. | Passer à `Africa/Casablanca` change l'interprétation des horodatages **déjà enregistrés** (+1 h) : à décider **avant** que des données réelles ne s'accumulent en production. Correction partielle côté navigateur seul = incohérence entre colonnes. |
| 2 | **P1 — décision métier** | **Surpaiement accepté sans avertissement** : un paiement de 5 000 Dh sur une facture déjà payée donne `reste = -5 000 Dh`. Une faute de frappe (un zéro de trop) passe sans alerte. | Règle métier (avance client ?) à valider : refuser, avertir ou accepter. |
| 3 | **P1 — planifié** | Laravel 9 / PHP 8.0 hors support, 18 avis `composer audit` (rapport `PHASE-2-DEPENDENCY-AUDIT.md`). | Hors périmètre de cette étape ; à faire avant la mise en ligne. |
| 4 | P2 | **Listes non paginées** : `GET /domiciliations` renvoie toute la liste. Mesure avec 2 688 domiciliations (clones) : **697 ms, 2,3 Mo** (SQL seulement 34 ms, le reste est la sérialisation) ; croissance linéaire (~5 000 → 1,3 s, 4,5 Mo). Les autres listes (clients, entreprises, factures, paiements) suivent le même principe. | Refonte de l'API et du frontend (pagination serveur) : hors périmètre ; impact faible tant que le cabinet reste à quelques centaines de lignes actives. |
| 5 | P2 | **Bundle JavaScript** : 1 176 Ko (326 Ko compressé) en un seul fichier, aucune route en chargement différé ; les bibliothèques PDF sont déjà chargées à la demande. | Optimisation, pas un bug ; premier chargement correct en 4G / fibre. |
| 6 | P2 | Double appel à `numero-propose` à l'ouverture d'un nouveau document (voulu : jamais mis en cache) ; le logo est rechargé 4 fois sur la page d'attestation (cache navigateur). | Sans impact mesurable. |
| 7 | P2 | **E-mail de réinitialisation** : texte du pied en anglais (« Regards », « If you're having trouble… », « All rights reserved ») et le lien du logo pointe vers `APP_URL` (le domaine de l'API, qui affiche la page d'accueil Laravel). | Cosmétique ; nécessite des traductions et un gabarit d'e-mail. |
| 8 | P2 | `POST /notes` avec un corps vide crée une note vide ; notes et fichiers modifiables/supprimables par tout utilisateur connecté (déjà signalé en phase 1). | Décision métier (propriété des notes). |
| 9 | P2 | Renouvellement d'une domiciliation : aucun garde-fou serveur contre un double envoi (deux renouvellements possibles). Non reproduit côté interface (bouton désactivé non vérifié). | Règle métier à confirmer. |
| 10 | P2 | Interface : à 1024 px de large, les libellés « Clients » et « Numéro » se chevauchent dans le formulaire de facture ; le formulaire de modification affiche brièvement un formulaire vide avant l'arrivée des données ; le menu liste tous les modules même sans droit (les pages répondent par un message). | Retouches de design, hors périmètre. |
| 11 | P2 | Fichier `src/data/mockData.js` non importé (code mort). La façade `GET /` de l'API affiche la page d'accueil Laravel. En-tête `X-Powered-By: PHP/x.y.z` exposé. | Nettoyage ultérieur ; `expose_php=Off` côté serveur. |
| 12 | P2 | Numérotation : en base neuve, `numero-propose` renvoie vide tant que le compteur (Paramètres) n'est pas configuré : le numéro est alors à saisir à la main. | Comportement existant (documenté à l'étape 2) ; à configurer en production. |

## ⚪ Ce qui ne peut être testé qu'après LWS

1. Envoi **réel** de l'e-mail de réinitialisation (SMTP `mail.viaexpertssarl.com`, port 587 / 465, expéditeur autorisé, SPF/DKIM, réception hors courrier indésirable).
2. HTTPS et cookies : `SESSION_SECURE_COOKIE`, `SESSION_DOMAIN=.domaine`, `SANCTUM_STATEFUL_DOMAINS`, `FRONTEND_URL` ; une erreur donne 419 ou 500 « Session store not set » à la connexion.
3. `storage:link` (liens symboliques autorisés ?) : sans lien, **toutes les images et pièces jointes** (`/storage/…`) sont cassées ; `.htaccess` lu (`AllowOverride`) pour interdire l'exécution de PHP dans les uploads.
4. Version de PHP réellement active (cible 8.3), extensions, `upload_max_filesize` ≥ 25 Mo, MySQL/MariaDB (contraintes `CHECK`).
5. Ouverture du PDF dans un nouvel onglet, blocage de fenêtres surgissantes, bouton Imprimer du lecteur PDF, comportement de « Annuler », accumulation d'onglets : à valider dans Chrome, Edge et Safari réels (chaque impression ouvre un onglet qu'il faut fermer ; les PDF sont libérés après 10 minutes).
6. Compression gzip des réponses JSON, temps réels de chargement, proxy / IP réelle du client (`TrustProxies`) pour la limitation de connexion.
7. Rejouer la suite de tests (dont les tests de concurrence à vrais processus) sous Linux avant la mise en ligne.

## ACTIONS OBLIGATOIRES AVANT DÉPLOIEMENT

1. **Décider du fuseau horaire** (`Africa/Casablanca` recommandé) avant toute donnée réelle en production ; aligner ensuite `date_depart` des cachets / courriers.
2. **Décider de la règle de surpaiement** (refuser, avertir ou accepter) et l'appliquer si besoin.
3. **Valider et committer ces corrections** (4 fichiers modifiés + 4 fichiers ajoutés, voir § 8), puis rejouer les tests sous Linux.
4. **Réserves de la phase 1** : changer le mot de passe de l'ancien administrateur, confirmer la visibilité privée du dépôt GitHub, configuration LWS contre l'exécution de PHP dans `/storage`, décision sur la propriété des notes / fichiers.
5. **Montée PHP / Laravel** (phase 2) avant la mise en ligne : au minimum PHP 8.3 + paquets Symfony dans les contraintes, cible Laravel 13 par paliers.
6. `.env` de production complet, **frontend recompilé avec `VITE_API_URL`** (sinon repli sur `localhost:8000`), `APP_DEBUG=false`, SMTP, `FRONTEND_URL`, domaines Sanctum, compteurs de numérotation dans Paramètres.
7. Sauvegarde et plan de retour arrière testés (base + `storage/app/public`).
8. Vérifier sur LWS les points ⚪ 1 à 4 dès le premier déploiement de préproduction.

## ACTIONS QUI PEUVENT ATTENDRE

- Pagination serveur des listes (clients, entreprises, domiciliations, documents, paiements) quand le volume dépassera ~2 000 lignes.
- Découpage du bundle par routes (chargement différé), traductions et gabarit de l'e-mail de réinitialisation, retouches de design (chevauchement des libellés, flash du formulaire vide, menu selon les droits).
- Garde-fou serveur contre le double renouvellement, blocage des notes vides, retrait de `mockData.js`, en-têtes de sécurité HTTP (X-Frame-Options, HSTS, CSP) au niveau du serveur.
- Autres points P2 du tableau ci-dessus.

## 7. Résultats des tests

| Vérification | Avant (`a2ef616`) | Après |
|---|---|---|
| Backend | 425 passés + 1 échec connu | **426 passés + 1 échec connu** (`ServiceChatTest::test_empty_message_is_rejected`, non corrigé, comportement inchangé) |
| Vitest | 81 | **86** (+5) |
| Snapshots HTML / routes / permissions / API | 32 / 3 | inchangés (aucun fichier `.snap` ni JSON de référence modifié) |
| Lint | 0 erreur, 45 avertissements | 0 erreur, 45 avertissements |
| Build | OK | OK |
| `composer.json` / `composer.lock` | — | inchangés |

## 8. Fichiers modifiés par cet audit (non commités)

- `backend/app/Http/Controllers/Api/V1/PaiementController.php` — création de paiement en exclusion mutuelle.
- `frontend/src/modules/facturation/pages/DocumentList.jsx` — date de facturation formatée.
- `frontend/src/pages/Rapports.jsx` — date locale par défaut, message 403.
- `frontend/src/__tests__/domiciliation-frontend.test.js` — liste des consommateurs de `shared/utils/date.js`.
- Ajoutés : `backend/tests/Feature/PaiementConcurrenceTest.php`, `backend/tests/Support/creer_paiements_en_parallele.php`, `frontend/src/__tests__/corrections-audit.test.js`, ce rapport.
- Déjà non commité : `docs/security/PHASE-2-DEPENDENCY-AUDIT.md` (étape 22).

## 9. Verdict

**READY WITH RESERVES.** Aucun défaut critique : les parcours testés fonctionnent, les droits d'accès tiennent, les PDF sont corrects et le serveur est rapide aux volumes actuels. Le seul bug important trouvé (paiements simultanés) est corrigé et verrouillé par un test. L'application n'est toutefois **pas encore prête à être mise en production** tant que les actions obligatoires ci-dessus ne sont pas traitées, en particulier le fuseau horaire, la règle de surpaiement, la montée PHP/Laravel et la configuration LWS.
