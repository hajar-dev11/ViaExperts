# DOCUMENT DE PASSATION — Via Expert App

> Document autonome destiné à une nouvelle conversation Claude Code. Il contient tout le contexte nécessaire pour reprendre le travail sans refaire l'analyse déjà effectuée. Aucune information de la conversation précédente n'est nécessaire au-delà de ce document.

**Date de rédaction :** 2026-09 (session de passation)
**Emplacement du projet :** `C:\Users\hp\Desktop\Via Expert App\`

---

## 1. PROJET

- **Nom :** Via Expert App
- **Type :** Application de gestion pour un bureau de comptabilité + centre de domiciliation d'entreprises (marché marocain — CIN, ICE, IF, RC, TP, CNSS, TVA 20/14/10/7/0%, MAD/Dh)
- **Chemin :** `C:\Users\hp\Desktop\Via Expert App\frontend` (le dossier `frontend` contient tout le code source actuel ; il n'existe pour l'instant **aucun dossier backend**)
- **Stack frontend actuelle :**
  - React 18/19 + Vite (build tool)
  - React Router en mode `HashRouter` (URLs du type `#/clients`)
  - Tailwind CSS v4
  - `lucide-react` pour les icônes
  - `recharts` pour les graphiques du Dashboard
  - Pas de librairie de state management globale (React state local + `localStorage` pour certains modules)
- **Structure connue :**
  ```
  frontend/src/
    pages/            → une page par écran (ClientsList.jsx, EntrepriseForm.jsx, Dashboard.jsx, ...)
    components/       → composants partagés (Layout, Sidebar, Topbar, DataTable, Field, PageHeader,
                         StatusBadge, ListToolbar, EmptyState, Popover, CalculatorPanel,
                         TvaCalculatorPanel, DocumentList, DocumentForm, Logo, StatCard)
    context/           → FilesContext.jsx, NotesContext.jsx (React Context, état en mémoire/localStorage)
    data/mockData.js  → TOUTES les "données" et la logique CRUD actuelle (voir section 4 — c'est le
                         faux backend actuel : tableaux JS + fonctions add/update/get, persistance
                         partielle via localStorage)
    utils/format.js   → formatage taille fichier / date
    App.jsx           → toutes les routes (React Router)
    components/navConfig.js → structure de la sidebar
  ```
- **Architecture actuelle :** SPA 100% frontend. **Aucun backend, aucune base de données serveur.** Trois niveaux de "persistance" coexistent aujourd'hui :
  1. `localStorage` du navigateur (Clients, Entreprises, Notes) — survit au rechargement de page mais pas au changement de navigateur/poste, et n'est jamais partagé entre utilisateurs.
  2. État React en mémoire (Fichiers, Chat, la plupart des formulaires) — perdu au rechargement.
  3. Données figées à `[]` sans aucun moyen de les remplir (Domiciliation, Services, Facturation, Paiement, Déclarations TVA, Rapports — voir audit).
- **État visuel actuel :** design "corporate sobre" validé et appliqué — sidebar claire (pas sombre), palette teal/ambre héritée du logo, coins `rounded-lg` (pas `rounded-2xl`), logo "VIA EXPERTS — Cabinet Comptable & Conseil" inchangé. **Toute donnée personnelle/fictive de démonstration a été supprimée** — l'app doit rester livrée "vide" avec des états vides propres (`EmptyState.jsx`), jusqu'à ce que de vraies données (client réel) soient saisies.

---

## 2. OBJECTIF DU PROJET

Transformer ce frontend (aujourd'hui un mockup fonctionnel par endroits, mais sans backend réel) en **vraie application de gestion comptable** multi-utilisateur, avec des données persistées côté serveur, pour les modules suivants :

- **Clients** — fiches clients (personnes physiques)
- **Entreprises** — fiches sociétés gérées par le cabinet (ICE/IF/RC/TP/CNSS, domiciliation, secteurs d'activité)
- **Domiciliation** — contrats de domiciliation liant une entreprise à un centre de domiciliation
- **Services** — catalogue de prestations du cabinet + suivi des services en cours par dossier
- **Facturation** — Factures, Devis, Bons de Livraison, Factures d'Avoir
- **Paiements** — encaissements liés aux documents de facturation
- **Déclaration TVA** et **Chiffre d'Affaires**
- **Rapports** — journal de caisse quotidien
- **Cachets** et **Mails** — suivi d'activité administrative (dépôts/retraits de documents/courrier)
- **Fichiers** — gestion documentaire (upload/téléchargement/suppression)
- **Notes** — prise de notes libres
- **Archive / Corbeille** — cycle de vie des enregistrements (actif → archivé → corbeille → suppression définitive), transverse à tous les modules ci-dessus
- **Paramètres** — configuration du bureau, du centre de domiciliation, comptes utilisateurs
- **Data Center**, **Dashboard**, **Chat** (statut à clarifier, voir section 6)

L'objectif n'est **pas** de refaire le frontend, mais de lui donner une vraie couche de données (API + base de données) qui remplace les tableaux figés de `mockData.js`.

---

## 3. AUDIT DU FRONTEND (résultats complets — ne pas refaire cet audit)

Légende : ✅ fonctionne réellement · ❌ ne fonctionne pas / absent · 🔧 correction recommandée

### MODULE : Clients
✅ Create (`addClient()` → `localStorage`), Read (liste filtrée `status ≠ archive/corbeille`), Update (icône Modifier → `/clients/:id/modifier`, réutilise `ClientForm`), icône Informations → page dédiée `/clients/:id` (`ClientDetails.jsx`) avec consultation/édition/Archiver/Corbeille, persistance testée après rechargement complet.
❌ Aucune suppression définitive nulle part. Aucun moyen de consulter/restaurer un client archivé ou en corbeille (la page Archive/Corbeille est déconnectée — voir module dédié). Les 3 icônes de la barre d'outils en haut de liste (ListTree/Archive/Trash2) restent décoratives. Les champs arabes (اَلْجِنْس, الاسم الكامل) dans `ClientForm` utilisent `defaultValue` non contrôlé → jamais sauvegardés. `ClientDetails` n'expose pas `nomAr`/`adresseAr` à l'édition (valeurs conservées mais non modifiables depuis cet écran). Aucune confirmation avant Archiver/Corbeille. Aucune validation de format (email/téléphone/CIN) au-delà du `required` HTML natif. Pas de détection de doublon.
🔧 Reconnecter Archive/Corbeille aux vrais statuts ; ajouter confirmation avant archivage ; brancher ou retirer les champs arabes ; ajouter suppression définitive depuis la Corbeille.

### MODULE : Entreprises
✅ Create (`addEntreprise()` → `localStorage`, persistance vérifiée après rechargement complet), Read (liste filtrée), **Export CSV réel** (contenu vérifié), Archiver/Corbeille (barre d'outils, changent réellement `status`, persistent, retirent de la liste).
❌ Aucune fonctionnalité Modifier ni Informations par ligne (icônes décoratives) → une entreprise créée ne peut plus jamais être modifiée ni consultée en détail. Archiver/Corbeille agissent sur **toute la liste active en un clic** (pas de sélection ligne par ligne — aucun mécanisme de case à cocher n'existe dans `DataTable`). Pas d'accès aux entreprises archivées/corbeille (même déconnexion que Clients). Champ "Situation" toujours figé à `'Normale'` par défaut, non modifiable via le formulaire. La majorité des champs saisis (ICE, RC, IF, TP, CNSS, Capital, Tribunal, Forme, dates, secteurs, activités, N° dossier) ne sont réaffichés nulle part après création. Champ "Single" au libellé peu clair, fonction indéterminée. Aucune suppression définitive.
🔧 Ajouter une page "Informations Entreprise" (même logique que `ClientDetails`) ; reconnecter Archive/Corbeille.

### MODULE : Domiciliation (Gestion/Liste, Nouvelle, Calendrier, Centres)
✅ Calendrier (logique correcte mais toujours vide, voir ci-dessous) ; navigation entre les 3 onglets.
❌ **Module quasi entièrement non fonctionnel.** `DomiciliationForm` ne persiste rien (aucune fonction `addDomiciliation` n'existe). `domiciliations` figé à `[]` en permanence → Liste, Calendrier et le KPI Dashboard "Domiciliations en cours" resteront toujours vides. "Ajouter Centre de Domiciliation" = `alert('Démo — formulaire à brancher sur votre backend.')`. Aucun Update/Delete/Archive/Corbeille. Toolbar et actions de ligne (Renouveler/ListTree/Pencil) toutes décoratives. Les 11 centres réels (voir section 12) sont consultables mais non modifiables via l'UI.
🔧 Priorité haute — créer la persistance de ce module en premier (bloque le Dashboard).

### MODULE : Chat
✅ Envoi de message dans une conversation sélectionnée (état local) ; état vide correct (le crash historique sur liste de contacts vide a été corrigé).
❌ `chatContacts` figé à `[]`, **aucune fonctionnalité pour ajouter un contact** → page structurellement vide et inutilisable en l'état. Messages jamais persistés (perdus au rechargement). Champ de recherche des conversations décoratif. Aucune suppression de conversation.
🔧 Statut du module à clarifier avec l'utilisateur avant de le modéliser (voir section 6, point ❓).

### MODULE : Services / Services en cours
❌ `ServiceForm` ne persiste rien (aucune fonction `addService`). `servicesCatalog` figé à `[]` en permanence → **conséquence grave en cascade** : tous les sélecteurs de service (Paiement, Facturation) sont vides, et le bouton "Ajouter" ligne de service sur ces formulaires ne fait jamais rien (`servicesCatalog.find()` ne trouve jamais rien). `servicesEnCours` et `activiteServices` figés à `[]`. Toolbar et actions de ligne décoratives. Incohérence mineure : la barre d'outils Services n'a que 2 icônes (Archive/Trash2) contre 3 ailleurs.
🔧 **Priorité haute** — `addService()` débloque en cascade Paiement et Facturation.

### MODULE : Facturation (Factures / Devis / Bon de Livraison / Facture d'Avoir)
❌ `DocumentForm` (partagé par les 4 types) ne persiste rien. `factures`/`devis`/`bonsLivraison`/`avoirs` sont des tableaux **synthétiques**, générés une seule fois au chargement à partir des entreprises/clients présents à ce moment (dates/statuts/montants inventés) — ne reflètent jamais la saisie réelle de l'utilisateur. Le bouton "Ajouter" ligne dépend de `servicesCatalog` (toujours vide). Toolbar Exporter (a un `title` mais pas de `onClick`)/Archive/Trash2 décoratives sur les 4 pages. Actions de ligne Imprimer/ListTree décoratives. Aucun Update/Delete/Archive/Corbeille réel.
🔧 Créer une vraie persistance ; retirer la génération synthétique une fois en place.

### MODULE : Paiement
❌ `PaiementForm` ne persiste rien. `paiements` dérivé de `factures` (lui-même synthétique). Bouton "Ajouter" ligne non fonctionnel (dépend de `servicesCatalog`). "Pièce à joindre" : le nom du fichier est affiché mais jamais uploadé ni lié au module Fichiers — perdu à la navigation. Toolbar Exporter/Archive/Trash2 décoratives.
🔧 Brancher le champ fichier sur le futur module Fichiers plutôt que dupliquer un faux upload.

### MODULE : Mouvement (Entrées Reçu / Facturé)
✅ Agrégation en lecture seule correcte (sommes bien calculées à partir des données existantes).
❌ Barre de filtres (2 dates + select Trimestre + bouton "Filtrer") 100% décorative — aucun state, aucun `onClick`. Chiffres affichés reflètent des données synthétiques (voir Paiement/Facturation).

### MODULE : Déclaration TVA / Chiffre d'Affaires
❌ `TvaForm` (partagé) ne persiste rien ; `declarationsTVA`/`chiffresAffaires` figés à `[]`. **Boutons "Export ZIP", "Export XML", "Export XLS"** : en réalité de simples `type="submit"` qui ne font que soumettre le formulaire (navigation) — **aucun fichier n'est généré dans aucun des 3 formats**, malgré une apparence de fonctionnalité complète. Action de ligne `⋯` sans `onClick`. Aucun Read/Update/Delete/Archive/Corbeille.
🔧 Implémenter un export réel (le module Entreprises a un export CSV fonctionnel qui peut servir de modèle).

### MODULE : Rapports
❌ `RapportForm` ne persiste rien ; `rapports` figé à `[]`. Pièce jointe : même limitation que Paiement (nom de fichier seul).
✅ Calcul en direct de "Total Revenu du Jour" (seule logique métier réellement opérationnelle du module).
🔧 Persistance réelle + branchement sur le futur module Fichiers.

### MODULE : Cachets
❌ "Nouveau Cachet" = `alert('Démo...')`. `cachets` **généré automatiquement** à partir des 6 premières entreprises (statut/dates fabriqués par index) — dès qu'une vraie entreprise existe, des lignes d'activité factices apparaissent (peut induire en erreur). Actions de ligne décoratives. Aucun Update/Delete/Archive/Corbeille.

### MODULE : Mails
❌ Identique à Cachets (bouton "Nouveau Mail" = alert, données générées automatiquement depuis les entreprises, actions de ligne décoratives, aucun CRUD réel).

### MODULE : Fichiers
✅ Upload réel (multiple), liste réelle, téléchargement réel (blob), suppression réelle, recherche/pagination, état vide correct.
❌ Stockage **en mémoire uniquement** (React Context, pas de `localStorage`) → tous les fichiers sont perdus au rechargement, contrairement à Clients/Entreprises/Notes. Pas de renommage, pas de dossiers/catégories, pas de limite de taille/type.

### MODULE : Notes
✅ CRUD complet (créer/sélectionner/modifier/supprimer), persistance `localStorage` vérifiée après rechargement, recherche, état vide.
❌ Aucune confirmation avant suppression. Pas de formatage de texte.

### MODULE : Data Center
❌ "Nouvelle Fiche" = `alert('Démo...')`. `dataCenter` = simple miroir en lecture seule de `entreprises` (dénomination/ICE/IF/RC/TP), aucun CRUD indépendant, actions de ligne décoratives. Fait doublon avec la liste Entreprises sans valeur ajoutée claire.

### MODULE : Archive / Corbeille
❌ **Problème critique — module totalement déconnecté du reste de l'application.** `archiveCounts`/`corbeilleCounts` sont des objets **codés en dur à 0**, jamais incrémentés. Les catégories Clients/Entreprises utilisent `clients.slice(0, counts.clients)`/`entreprises.slice(0, counts.entreprises)` → avec des compteurs à 0, ces listes sont **toujours vides**, même quand des clients/entreprises ont réellement `status: 'archive'`/`'corbeille'` (mécanisme construit pendant cette conversation pour Clients/Entreprises). **Conséquence concrète :** archiver un client/une entreprise le fait disparaître de sa liste principale, mais il n'apparaît **jamais** dans Archive/Corbeille et ne peut **jamais être restauré ni supprimé définitivement** depuis l'UI — données orphelines (toujours en `localStorage`, mais inaccessibles). Catégories "Services"/"Documents" codées en dur à `rows: []`. Bouton Restaurer (RotateCcw) sans `onClick`.
🔧 **Priorité haute** — recalculer les compteurs dynamiquement depuis les vrais champs `status` ; implémenter le bouton Restaurer.

### MODULE : Paramètres
❌ **Page quasi 100% non fonctionnelle.** Tous les champs des 7 onglets (Compte, Bureau, Centre Domiciliation, Services, Cachet, Mail, Assistance) sont des `Input` non contrôlés (pas de `value`/`onChange`). **Tous** les boutons "Enregistrer"/"Mettre à jour"/"Envoyer la demande" n'ont aucun `onClick`. "Changer la photo" sans effet. Sous-onglet Sécurité sans validation ni submit.
❌ Impact transversal : le lien "Voir le profil" du menu Topbar pointe ici et laisse croire que le profil est modifiable — ce n'est pas le cas.
🔧 **Priorité haute** — c'est la page la moins fonctionnelle du projet.

### MODULE : Tableau de bord (Dashboard)
✅ KPI calculés en direct depuis les vraies données (clients/entreprises/domiciliations/factures). États vides corrects sur les 2 graphiques et les 2 panneaux latéraux. Lien "Voir tout" fonctionnel.
❌ Sous-texte de chaque carte KPI codé en dur sur `'Aucune donnée'`, même quand la valeur principale n'est plus 0 (incohérent). `dashboardTrend`/`expenseRatio` figés à `[]` sans logique de calcul les alimentant → les 2 graphiques resteront toujours vides.

### OBSERVATIONS TRANSVERSALES (Navigation, code mort)
✅ Les 19 entrées de sidebar et tous leurs sous-liens pointent vers des routes existantes — **aucun lien cassé détecté**.
❌ Sélecteur "Dossier actif" du Topbar calculé une seule fois au montage (`useMemo(..., [])`) → jamais mis à jour, et n'influence aucune autre partie de l'app (cosmétique). "Notifications" toujours vide (aucun système ne génère jamais de notification). Recherche globale limitée à 5 sources sur ~15 modules. Pied de sidebar affiche encore "— Démo".
- Code mort identifié : export `persistEntreprises` (mockData.js) jamais utilisé ; prop `emptyIcon` de `ArchivedPanel` (Archive.jsx) jamais transmise ; états visuels `trend="up"/"down"` de `StatCard.jsx` inatteignables (Dashboard ne passe plus que `'flat'`) ; state local `entite` dans `DocumentForm`/`PaiementForm` togglé mais jamais utilisé. Tableaux `mockData.js` en permanence vides sans aucun point d'écriture : `chatContacts`, `dashboardTrend`, `expenseRatio`, `servicesCatalog`, `servicesEnCours`, `activiteServices`, `domiciliations`, `declarationsTVA`, `chiffresAffaires`, `rapports`.

---

## 4. PROBLÈMES CRITIQUES (impact global)

1. **Absence totale de backend et de base de données serveur.** Tout vit dans le navigateur (localStorage ou mémoire React). Aucune donnée n'est partagée entre utilisateurs/postes. C'est la raison d'être du travail à venir.
2. **`localStorage` comme seule persistance actuelle** (Clients, Entreprises, Notes) — fonctionne pour un seul poste/navigateur, disparaît si le cache est vidé, ne permet aucun accès concurrent multi-utilisateur.
3. **Données synthétiques trompeuses** : `factures`, `devis`, `bonsLivraison`, `avoirs`, `paiements`, `cachets`, `mails`, `dataCenter` sont générés automatiquement à partir des entreprises/clients existants (formules d'index), **pas** à partir de ce que l'utilisateur saisit réellement — à supprimer une fois la vraie persistance en place, sous peine de continuer à afficher de fausses informations à côté des vraies.
4. **Modules non persistants qui bloquent d'autres modules en cascade** : `Services` vide bloque les lignes de commande dans `Paiement` et `Facturation` (le bouton "Ajouter" ne trouve jamais de service à ajouter). `Domiciliation` vide bloque le Dashboard (KPI et graphique toujours vides).
5. **Archive/Corbeille complètement déconnectée** des vrais statuts pour Clients et Entreprises (compteurs codés en dur à 0) → des enregistrements archivés deviennent inaccessibles et non restaurables nulle part dans l'UI.
6. **Aucune suppression définitive nulle part** dans toute l'application.
7. **Paramètres à 0% fonctionnel** — aucun champ contrôlé, aucun bouton actif.
8. **Plusieurs boutons "Exporter"** (Déclaration TVA : ZIP/XML/XLS) ne produisent **aucun fichier** malgré une apparence de fonctionnalité complète — seul l'export CSV d'Entreprises est réel.
9. **Placeholders explicites non fonctionnels** (`alert('Démo — formulaire à brancher sur votre backend.')`) sur : Cachets, Data Center, Domiciliation/Centres, Mails.

---

## 5. BACKEND — décision technique

**✅ Décision validée par l'utilisateur** (contrainte externe, non négociable) :
- **Backend : Laravel**
- **Base de données : MySQL**

**⚠️ Propositions faites en réponse à cette contrainte, pas encore validées ligne par ligne par l'utilisateur** (mais présentées comme la voie recommandée pour la suite) :

| Besoin | Proposition | Pourquoi |
|---|---|---|
| Auth API pour SPA React | **Laravel Sanctum** | Fait spécifiquement pour une SPA qui consomme une API Laravel (cookies/session, pas de gestion de token compliquée côté frontend) |
| Rôles/permissions | **spatie/laravel-permission** | Rôles `admin`/`comptable`/`assistant` nécessaires pour remplacer les champs "responsable" en texte libre par de vrais utilisateurs |
| Fichiers/pièces jointes | **spatie/laravel-medialibrary** | Correspond exactement au besoin d'une table `files` polymorphe unique, réutilisée par le module Fichiers ET les pièces jointes actuellement fantômes de Paiement/Rapports |
| Journal d'audit | **spatie/laravel-activitylog** | Traçabilité qui/quoi/quand, standard dans un logiciel comptable, absent aujourd'hui |
| Exports CSV/XLSX | **maatwebsite/excel** | Corrige directement le bug des boutons Export ZIP/XML/XLS qui ne génèrent rien |
| Validation | **Laravel Form Requests** | Corrige l'absence totale de validation constatée sur tous les formulaires actuels |
| Sérialisation API | **Laravel API Resources** | Façon standard d'exposer chaque modèle Eloquent en JSON |

Ces choix de packages Laravel restent à confirmer par l'utilisateur avant d'être considérés comme définitifs — ils n'ont pas été explicitement approuvés un par un, seulement le couple Laravel + MySQL.

---

## 6. ARCHITECTURE DATABASE — décisions et propositions

**✅ Décision validée :** MySQL comme SGBD (InnoDB, clés étrangères actives).

**⚠️ Propositions à valider avant toute migration Laravel :**

- **Champ `status` unifié** (`actif` / `archive` / `corbeille`) sur toute entité concernée (Clients, Entreprises, Services, Documents, Cachets, Mails, Domiciliations…) — corrige la déconnexion Archive/Corbeille constatée dans l'audit. Les listes principales filtrent `status = 'actif'` ; la page Archive/Corbeille filtre sur les deux autres valeurs.
- **`SoftDeletes` natif de Laravel** (`deleted_at`) réservé à la **suppression définitive uniquement** (accessible seulement depuis la Corbeille), en complément du champ `status` qui gère à lui seul les trois états actif/archive/corbeille. Laravel ne gère nativement que 2 états (présent/supprimé), d'où la nécessité du champ `status` en plus.
- **Montants monétaires en `DECIMAL(12,2)`**, jamais en `FLOAT` (HT, TVA, TTC, prix, capital, montants de paiement).
- **Table `documents` unifiée** pour Factures/Devis/Bons de Livraison/Factures d'Avoir (champ `type` en enum), au lieu de 4 tables dupliquées — ces 4 types partagent exactement la même structure dans le frontend actuel (même composants `DocumentForm`/`DocumentList`).
- **`document_lignes` en snapshot** : prix/TVA copiés au moment de la création de la ligne (pas recalculés depuis `services` à la volée) — principe comptable : une facture émise ne doit jamais changer si le prix catalogue change ensuite.
- **Journal d'audit** (`audit_log` via spatie/laravel-activitylog) sur les modèles sensibles.
- **Relations Client/Entreprise ("Tiers")** — plusieurs modules (Domiciliation, Documents, Paiements, Cachets, Mails, Déclarations TVA) référencent "une entreprise OU un client". Deux options envisagées :
  - **Option A :** table `parties` (tiers) unifiée, `Clients`/`Entreprises` en extensions 1-1 ; toutes les autres tables pointent vers un seul `party_id`.
  - **Option B :** deux clés étrangères nullables (`entreprise_id`, `client_id`) avec contrainte applicative "exactement un des deux rempli" — plus proche du code frontend actuel (`showEntreprises`/`showClients` dans `DocumentForm`/`PaiementForm`).

**❓ Points non décidés — à trancher explicitement avant ou pendant la conception du schéma :**
- Option A vs Option B pour le modèle Tiers (voir ci-dessus).
- Portée du module **Chat** : vraie messagerie interne persistée, ou hors périmètre V1 ? (aujourd'hui sans aucune donnée réelle ni moyen d'ajouter un contact).
- Application mono-tenant (un seul cabinet, plusieurs utilisateurs) ou multi-tenant (plusieurs cabinets clients du logiciel) ? La conception actuelle suppose **mono-tenant multi-utilisateur**, à confirmer.
- Enum MySQL natif vs colonne `string` + enum applicatif Laravel pour les champs de statut (l'enum natif MySQL est rigide en cas d'évolution du schéma — à trancher selon préférence de l'équipe).
- Fusion ou non de `declarations_tva` et `chiffres_affaires` (structures quasi identiques dans le frontend actuel) en une seule table avec un champ `type`.

**Rappel important :** les fichiers actuels `mockData.js` contiennent déjà, en commentaires et dans le code, toute la forme exacte des champs actuellement saisis par chaque formulaire (Clients, Entreprises, Domiciliation, Services, Documents, Paiements, Déclaration TVA, Rapports) — **s'y référer directement** pour ne pas réinventer une liste de champs différente de ce que le frontend envoie déjà.

---

## 7. API — architecture proposée (⚠️ non implémentée, proposition seulement)

Patron REST identique pour chaque module CRUD (Clients, Entreprises, Domiciliation, Services, Documents, Paiements, Déclarations TVA, Rapports, Cachets, Mails, Fichiers, Notes) :

```
GET    /api/v1/{module}              liste (filtrée sur status=actif par défaut)
POST   /api/v1/{module}               création
GET    /api/v1/{module}/{id}          détail
PATCH  /api/v1/{module}/{id}          modification
POST   /api/v1/{module}/{id}/archive   → status = archive
POST   /api/v1/{module}/{id}/corbeille → status = corbeille
POST   /api/v1/{module}/{id}/restore   → status = actif
DELETE /api/v1/{module}/{id}          suppression définitive (uniquement si status = corbeille)
```

Endpoints transverses complémentaires :
- `POST /api/v1/auth/login`, `/logout`, `GET /api/v1/auth/me`, `/sanctum/csrf-cookie`
- `GET /api/v1/search?q=` — recherche globale côté serveur sur tous les modules (corrige la limite actuelle : 5 modules sur ~15 côté frontend)
- `GET /api/v1/{module}/export` — via maatwebsite/excel, réutilisable partout (aujourd'hui seul Entreprises a un export réel, fait côté navigateur)
- `POST /api/v1/files` (upload), `GET /api/v1/files/{id}` (téléchargement)
- `GET /api/v1/dashboard/kpis` — agrégations calculées côté serveur au lieu des `.filter()/.reduce()` actuellement en clair dans les composants React

---

## 8. INTÉGRATION FRONTEND / BACKEND (⚠️ non implémentée, proposition seulement)

Objectif explicite : **garder l'UI et la structure de composants du frontend telles quelles**, ne changer que la couche données.

- Créer un nouveau dossier `frontend/src/api/` qui remplace progressivement les fonctions actuelles de `mockData.js` (`addClient`, `updateClient`, `getClientById`, `addEntreprise`, etc.) par des équivalents **asynchrones** appelant l'API Laravel — mêmes noms de fonctions, même usage côté composants (juste `async/await` en plus).
- **Laravel Sanctum** pour une SPA : appeler `GET /sanctum/csrf-cookie` avant le login, cookie de session géré par le navigateur (`withCredentials: true` côté fetch/axios) — à encapsuler dans la couche `src/api/`.
- **React Query** (ou SWR) recommandé côté frontend pour le cache/invalidation des listes, indépendamment du choix backend.
- Ajouter une page de connexion + garde de routes (redirection si non authentifié) — actuellement aucune authentification n'existe dans le frontend.
- **Aucun changement de design, de navbar, de sidebar, de couleurs** ne doit accompagner cette migration — uniquement le remplacement de la source de données.

---

## 9. RÈGLES IMPORTANTES DE TRAVAIL (à respecter impérativement)

- Ne jamais modifier le design existant sans demande explicite.
- Ne pas changer les couleurs.
- Ne pas changer la navbar/sidebar sans demande explicite.
- Ne pas supprimer une fonctionnalité existante.
- Ne pas faire de refactoring non demandé.
- Ne pas créer de fonctionnalités supplémentaires sans demande explicite.
- Travailler directement avec l'architecture existante (composants `Field`/`Select`/`Input`/`FormCard`/`DataTable`/`ListToolbar`/`PageHeader` déjà en place côté frontend — les réutiliser, ne pas les dupliquer).
- **Vérifier que chaque fonctionnalité fonctionne réellement** — ne jamais se contenter d'un rendu visuel qui a l'air correct : tester les vraies données (ajout → apparaît dans la liste → survit à un rechargement complet de page → les actions Archiver/Corbeille/Export produisent un effet réel et vérifiable).
- Ne jamais créer de fausses données pour simuler une fonctionnalité qui ne marche pas (c'est exactement le défaut identifié dans l'audit sur `cachets`/`mails`/`factures`/etc. — à ne pas reproduire côté backend).
- Ne pas considérer une interface visuellement présente comme fonctionnelle (icônes/boutons sans `onClick`, formulaires non contrôlés — vérifier le comportement réel, pas seulement l'apparence).
- Tester systématiquement la persistance des données (pas seulement l'état React immédiat après une action).
- Avant toute modification importante, **expliquer ce qui va être modifié** avant de l'exécuter.
- Si une décision métier n'est pas définie (voir section 6, points ❓), **demander confirmation à l'utilisateur au lieu d'inventer une réponse**.
- Aucune donnée personnelle ou fictive ne doit être introduite dans le code, les seeders ou la documentation (contrainte déjà appliquée strictement au frontend lors d'une session précédente — à respecter aussi côté backend/seeders, sauf données de test explicitement marquées comme telles et non destinées à la production).
- Les 11 centres de domiciliation et la structure secteurs/activité (section 12) sont des **données métier réelles fournies par l'utilisateur**, pas des données de démonstration — elles doivent être conservées telles quelles, contrairement aux anciennes données fictives déjà supprimées.

---

## 10. ÉTAT EXACT DU TRAVAIL

### CE QUI A ÉTÉ FAIT (code déjà modifié dans le frontend, sessions précédentes)
- Refonte visuelle complète vers un design "corporate sobre" (sidebar claire, teal/ambre, `rounded-lg`).
- Suppression de toute donnée personnelle/fictive de `mockData.js` ; ajout d'états vides (`EmptyState.jsx`) partout où nécessaire.
- Ajout de fonctionnalités navbar : recherche globale, module Fichiers (page + aperçu popover), module Notes (page + aperçu popover, persistant), Calculatrice, Calculateur de TVA, aperçu Profil, menu "Outils" compact pour mobile.
- Correction du bug Clients : l'ajout d'un client apparaît désormais bien dans la liste (`addClient()` + `localStorage`).
- Création de la page `ClientDetails.jsx` (`/clients/:id`) : consultation, édition, Archiver, Mettre à la corbeille.
- `ClientForm.jsx` : support du mode édition via `/clients/:id/modifier`.
- `EntrepriseForm.jsx` : ajout des champs Local (4 options exactes), Centre de Domiciliation (conditionnel, 11 centres réels), N° de Dossier, N° d'Archive, Observation, Client (select dynamique), Secteur d'Activité (multi, bouton +/-, option "Autre" avec champ libre), Activité (renommé depuis "Activité Exacte", positionné sous chaque Secteur, numéroté si plusieurs secteurs).
- `addEntreprise()` + persistance `localStorage` ; `EntreprisesList.jsx` : Export CSV réel, Archiver/Corbeille (bulk sur la liste active), filtrage sur `status`.
- Correction d'un bug de crash (page blanche complète) dans `Chat.jsx` causé par une liste de contacts vide non gérée.
- **Audit technique complet du frontend** (repris intégralement en section 3 ci-dessus).
- **Proposition d'architecture backend** (générique d'abord, puis adaptée à Laravel + MySQL suite à la contrainte de l'utilisateur).

### CE QUI A ÉTÉ ANALYSÉ
- Audit complet des ~20 modules du frontend : ce qui fonctionne, ce qui ne fonctionne pas, dépendances entre modules, code mort.
- Architecture backend/database/API à un niveau de conception générale (entités, relations, décisions structurantes) — **pas encore au niveau du schéma SQL détaillé**.

### CE QUI N'A PAS ENCORE ÉTÉ FAIT
- Aucune installation de Laravel dans le projet.
- Aucune migration Laravel créée.
- Aucun modèle Eloquent créé.
- Aucun schéma MySQL détaillé (tables, colonnes, types, nullable, defaults, PK, FK, index, contraintes unique, règles `ON DELETE`).
- Aucune API réellement implémentée.
- Aucune connexion frontend ↔ backend (le dossier `frontend/src/api/` n'existe pas encore).
- Aucune décision tranchée sur les points marqués ❓ en section 6.

### CE QUI DOIT ÊTRE FAIT ENSUITE
Voir section 11 — concevoir complètement le schéma MySQL, **avant** toute implémentation Laravel.

---

## 11. PROCHAINE ÉTAPE

**La prochaine étape prévue est : concevoir complètement le schéma MySQL, avant toute implémentation Laravel.**

Le prochain agent Claude Code doit **commencer par cette étape de conception** et **ne pas commencer à coder directement** (pas de `laravel new`, pas de migration, pas de modèle tant que le schéma n'est pas validé par l'utilisateur).

Livrable attendu pour cette étape :
- Liste complète des tables (reprenant les entités de la section 6, en tranchant au préalable les points ❓ avec l'utilisateur si besoin, notamment Option A vs B pour le modèle Tiers)
- Pour chaque table : colonnes, types MySQL, nullable ou non, valeurs par défaut, clé primaire
- Toutes les clés étrangères et leurs règles `ON DELETE` / `ON UPDATE`
- Index et contraintes `UNIQUE` nécessaires (ex. numéro de document unique par type/année, email unique par utilisateur)
- Relations entre tables clairement explicitées (1-1, 1-N, N-N avec table pivot le cas échéant)
- Prise en compte explicite de : `status` actif/archive/corbeille, `SoftDeletes` pour la suppression définitive, documents comptables (`documents` + `document_lignes` en snapshot), fichiers polymorphes, journal d'audit
- Le schéma doit être présenté clairement (tableaux ou listes structurées), **sans encore écrire de code de migration Laravel** — cette conception doit d'abord être validée par l'utilisateur avant toute génération de code.

---

## 12. HISTORIQUE DES INSTRUCTIONS FONCTIONNELLES IMPORTANTES

Ces demandes précises ont été faites pendant la conversation et **doivent être respectées telles quelles** lors de la conception du schéma (elles définissent la forme exacte de plusieurs champs) :

**Clients**
- Corriger le bug : un client ajouté doit apparaître dans la liste des clients (fait côté frontend).
- Icône "Modifier" dans la liste : doit permettre une modification réelle des informations du client concerné (fait côté frontend).
- Icône "Informations" : doit ouvrir une page séparée dédiée, permettant de consulter les informations, les modifier, archiver le client, le mettre à la corbeille — ces actions doivent fonctionner réellement avec les données existantes (fait côté frontend).

**Entreprises — champ "Local"**
- Ajouter un select "Local" avec **exactement ces 4 options** : "Sélectionner Local", "Contrat de domiciliation", "Contrat de bail", "Attestation de propriété".
- Si "Contrat de domiciliation" est choisi → afficher le champ "Centre de domiciliation".

**Entreprises — Centres de domiciliation (liste réelle, à conserver telle quelle)**
```
CS Plus
VIA EXPERTS
VIVENDIS INVEST
MA EXPERTISE SERVICES
FIDU-FISCASS CONSULTING & SERVICES MOROCCO
MOORISH ACCOUNTING GROUP
stratflow consulting
RECAT BUSINESS GROUP
CENTRE RAKEM D'AFFAIRES
ALMAGHRIBIA LITATWIN
MACHROUHI AFFAIRE
```
(11 centres, ordre exact ci-dessus — ce sont de vraies données métier fournies par l'utilisateur, pas des données de démonstration.)

**Entreprises — champs ajoutés**
- N° de dossier, N° d'archive, Observation, Client (select alimenté par la vraie liste des clients existants — l'ajout d'un client doit automatiquement le faire apparaître dans ce select), Secteur d'activité, Activité.

**Entreprises — Secteur d'activité**
- Select alimenté par une liste de secteurs/métiers.
- Bouton "+" à côté du champ pour ajouter plusieurs secteurs d'activité pour la même entreprise ; bouton "-" pour retirer un secteur ajouté.
- Option "Autre" dans le select : doit afficher un champ texte libre pour saisir un secteur personnalisé ; la valeur saisie doit être enregistrée correctement avec les données de l'entreprise (pas la valeur littérale "Autre").

**Entreprises — champ "Activité"**
- Renommer "Activité exacte" en "Activité" (retirer le mot "exact").
- Le placer directement en dessous du champ "Secteur d'activité" correspondant.
- Si l'utilisateur ajoute un 2ᵉ secteur (bouton "+"), un 2ᵉ champ "Activité" correspondant doit apparaître automatiquement — chaque secteur a son propre champ Activité associé.
- Numérotation des labels : un seul secteur → "Secteur d'activité" / "Activité" (sans numéro) ; plusieurs secteurs → "Secteur d'activité 1" / "Activité 1", "Secteur d'activité 2" / "Activité 2", etc.

**Entreprises — liste**
- Icône "Exporter" doit fonctionner réellement avec les entreprises présentes dans la liste (implique un export sur l'ensemble de la liste visible, pas une sélection ligne par ligne — aucune case à cocher n'existe).
- Icône "Archiver" doit permettre d'archiver correctement.
- Icône "Corbeille" doit permettre de déplacer vers la corbeille correctement.
- Après ajout d'une entreprise : elle doit être correctement enregistrée, apparaître dans la liste, et les informations doivent être récupérables après actualisation de la page (persistance réelle exigée, pas seulement en mémoire).

**Contrainte répétée à chaque étape par l'utilisateur**
- Ne rien modifier d'autre que ce qui est explicitement demandé : ne pas changer le design, les couleurs, la navbar, les pages non concernées, l'architecture générale ; ne pas refactoriser ; ne pas supprimer de fonctionnalité existante ; ne pas remplacer un composant existant inutilement.

---

## 13. FORMAT / RÉCAPITULATIF

| Question | Réponse |
|---|---|
| Où en est le projet ? | Frontend React fonctionnel visuellement, design validé, données de démo supprimées ; **zéro backend réel**. |
| Qu'est-ce qui a été fait ? | Audit complet du frontend (20 modules) + correctifs ciblés sur Clients/Entreprises (formulaire, liste, archive/corbeille partiel) + proposition d'architecture backend adaptée à Laravel/MySQL. |
| Qu'est-ce qui est cassé ? | Voir section 3 (module par module) et section 4 (impacts critiques) — en résumé : la quasi-totalité des modules autres que Clients/Entreprises/Notes/Fichiers n'ont aucune persistance réelle, et Archive/Corbeille est déconnectée même pour les modules qui fonctionnent. |
| Qu'est-ce qui a été décidé ? | Laravel + MySQL (✅ imposé par contrainte externe). Tout le reste (packages, modèle Tiers, structure des tables) est proposé mais ⚠️ non validé point par point, ou ❓ non tranché. |
| Qu'est-ce qui reste à décider ? | Voir les points ❓ de la section 6 (modèle Tiers, portée du Chat, mono/multi-tenant, enum natif vs applicatif, fusion Déclaration TVA/Chiffre d'Affaires). |
| Que faut-il faire ensuite ? | Concevoir le schéma MySQL complet (section 11) — **avant tout code**. |

---

## INSTRUCTION POUR LE PROCHAIN CHAT

Message prêt à coller en premier message d'une nouvelle conversation Claude Code :

> Lis entièrement le fichier `PASSATION.md` à la racine du projet `Via Expert App` avant toute action. Ce document contient l'intégralité du contexte : audit complet du frontend déjà réalisé (ne le refais pas), décisions techniques déjà prises (Laravel + MySQL), propositions d'architecture encore à valider, et l'historique précis des demandes fonctionnelles déjà traitées côté frontend (Clients, Entreprises, Local, Centres de domiciliation, Secteurs d'activité multiples, option "Autre", Archive/Corbeille, Export).
>
> Une fois le document lu et compris, reprends exactement à l'étape prévue en section 11 : **concevoir complètement le schéma de base de données MySQL** (tables, colonnes, types, nullable, defaults, clés primaires/étrangères, index, contraintes unique, relations, règles ON DELETE), en tenant compte de tous les modules et dépendances identifiés dans l'audit.
>
> Ne modifie aucun fichier du projet, ne crée aucune migration Laravel, ne crée aucun modèle, ne commence aucune implémentation tant que ce schéma n'a pas été présenté et validé avec moi. Si un point métier n'est pas encore tranché (voir les points marqués ❓ dans le document), demande-moi de trancher au lieu de décider à ma place.
