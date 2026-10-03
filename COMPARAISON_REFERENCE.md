# COMPARAISON — Système de référence (DOCX) ↔ Projet actuel

> Objectif : rendre le projet **identique au système de référence** `viaexperts.online`,
> en style **et** en logique.
> Source : `ANALYSE DU PROJET\Analyse du système de comptabilité.docx` — 90 captures.

**Date :** 2026-09-19

---

## 0. Méthode et périmètre de cet audit

Les 90 captures ont été extraites. **16 écrans ont été analysés en profondeur**, couleurs
relevées au pixel :

| # | Écran | # | Écran |
|---|---|---|---|
| 1-2 | Dashboard | 36 | Ajouter Facture (bas) |
| 3 | Nouveau Client | 37 | Liste des Factures |
| 4-5 | Liste Clients + menu d'actions | 47 | Ajouter Paiement |
| 10 | Ajouter Entreprise (bas) | 69 | Archive Entreprises |
| 19 | Nouvelle Domiciliation | 71 | Paramètre Account |
| 22 | Liste des domiciliations | 79 | Paramètre Assistance |
| 26 | Domiciliation par statut | 35 | Ajouter Facture (haut) |

⚠️ **74 captures restent à dépouiller une par une** (Facturation 38-46, Mouvement 53-56,
TVA 57-63, Rapports 64-65, Cachets 66, Mails 67, Data Center 68, Corbeille 70,
Paramètres 72-78 et 80-90). Les modules concernés sont marqués **« non audité »** plus bas :
je ne les déclare ni conformes ni non conformes sans les avoir vus.

---

## 1. Verdict global

| Axe | Parité estimée | Commentaire |
|---|---|---|
| **Identité visuelle** (couleurs, sidebar, topbar, logo, police) | **~95 %** | Fait lors des lots précédents |
| **Cartes, tableaux, pagination** | **~85 %** | Manque le titre dans la carte et le menu d'actions |
| **Formulaires** | **~25 %** | Seuls Client et Entreprise sont au gabarit de référence |
| **Logique métier** | **~70 %** | 4 mécanismes entiers manquent |
| **Architecture Archive** | **~30 %** | Conception différente (voir §4) |

---

## 2. Ce qui est DÉJÀ conforme

- Sidebar sombre `#2F3349`, groupe ouvert en **doré** `#D6A432`, entrée active en pilule
  violette dégradée, sous-entrées à puce annulaire, chevrons dorés, repli en rail.
- Topbar blanche **flottante arrondie**, recherche sans bordure, **bandeau rose du dossier
  actif**, outils, avatar à pastille verte.
- **Vrai logo** Via Experts (symbole détouré + marque + signature).
- Palette exacte : violet `#7367F0`, vert `#28C76F`, orange `#FF9F43`, rouge `#EA5455`,
  cyan `#00CFE8`, anthracite `#4B4B4B`, fond `#F8F7FA`.
- Boutons de liste au code couleur : **vert** ajouter, **violet** exporter, **orange**
  archiver, **anthracite** corbeille.
- Tableaux : lignes alternées, en-têtes MAJUSCULES, **pagination numérotée**, compteur
  d'entrées, valeurs clés en violet cliquable.
- Accueil : deux graphiques en haut (2/3 + 1/3), deux cartes en bas, **sans bandeau d'indicateurs**.
- Formulaires **Client** et **Entreprise** : champs à icône + filet vertical, bandeau violet
  pleine largeur en bas de carte.
- **Accordéon « Ajouter Domiciliation »** sur la page Entreprise (titre gras + chevron +
  filet dégradé vert + Sauvegarder pleine largeur).

---

## 3. ÉCARTS DE STYLE

### 3.1 Transversaux — à traiter en priorité

| # | Écart | Référence | Projet | Effort |
|---|---|---|---|---|
| S1 | **Titre de page hors carte** | Le titre (« List Des Clients ») est **dans** la carte, avec les boutons à sa droite | Titre au-dessus de la carte | Moyen — 13 listes |
| S2 | **Menu d'actions de ligne** | 2 icônes discrètes → menu déroulant **Afficher** (bleu) / **Archive** (orange) / **Supprimer** (rouge) | 2 à 6 icônes alignées, pas de menu | Moyen — composant `ActionMenu` déjà écrit, à brancher |
| S3 | **Champs à icône + filet** | Tous les champs des formulaires principaux | Seulement Client et Entreprise | Gros — 18 formulaires |
| S4 | **Boutons « + » violets** à côté des selects | Client, Secteur d'Activité, Activité, Services | Absents (sauf « + » secteur) | Moyen |
| S5 | **Cartes radio d'émetteur** « Via Experts / Centre Domiciliation » et « Maitre : Morad Bendeq / Bureau de Comptabilité » | Facturation et Paiement | À vérifier / probablement en selects | Moyen |
| S6 | **Interrupteurs violets** « Entreprises / Clients » + select combiné « Sélectionner Entreprise/Client » | Facturation et Paiement | Deux champs séparés | Moyen — `Switch` déjà écrit |
| S7 | **Case à cocher encadrée** (« Ajouter la Signature » dans une boîte bordée comme un champ) | Paiement | Case nue | Petit |
| S8 | **Champs de totaux à bordure colorée** : Total HT vert, Total Remise **rouge**, Prix Restants **orange** | Ajouter Facture | Bordures neutres | Petit |
| S9 | **Tableaux teintés par statut** : en-tête en couleur pleine + corps teinté (vert/orange/gris/rouge) | Domiciliation par statut | Badges seulement | Petit — `Table` accepte déjà `tone` |
| S10 | **Compteurs dans la sidebar** : « Entreprises (36) », « Paiements (5) » | Archive et Corbeille | Absents | Moyen |
| S11 | **Onglets en pilules violettes** « Profil / Sécurité » | Paramètre Account | Onglets soulignés | Petit |
| S12 | **Avatar carré** + boutons « Upload new photo » violet / « Reset » gris + mention « Allowed JPG, GIF or PNG. Max size of 800K » | Paramètre Account | À aligner | Petit |
| S13 | **Bouton submit à icône disquette** « 🖫 Sauvegarder » | Partout | Texte seul | Petit |
| S14 | **Libellés de tableau en anglais** : « Show 10 entries », « Showing 1 to 3 of 236 entries » | Partout | Traduits en français | Petit — **décision** |

### 3.2 Divergence interne de la référence — à trancher

La référence **n'est pas homogène** :

| Écran | Disposition des libellés |
|---|---|
| Nouveau Client | libellé **au-dessus** du champ |
| **Ajouter Entreprise** | libellé **à GAUCHE** du champ (2 colonnes label/champ) |
| Ajouter Facture / Paiement | libellé au-dessus, **sans** icône |
| Paramètre Account | libellé au-dessus, **sans** icône |

👉 **Décision nécessaire :** reproduire cette incohérence à l'identique, ou uniformiser
(libellé au-dessus partout) ? Le reste du document suppose **reproduction à l'identique**.

---

## 4. ÉCARTS D'ARCHITECTURE

### A1 — Archive / Corbeille : conception entièrement différente 🔴

| | Référence | Projet |
|---|---|---|
| Structure | **Un groupe de sidebar** avec une **page par catégorie** (`Archive_Entreprises.php`) | **Une seule page** `/archive` avec 15 catégories |
| Compteurs | Oui, dans la sidebar : Clients (1), Entreprises (36)… | Non |
| Retour | Bouton **vert « Liste Normale »** en haut de la carte | Bouton gris « Retour » |
| Titre | « Archived Entreprises » | « Archive » |
| Catégories | Clients, Entreprises, **Facturation** (sous-groupe), Services, **Documents**, **Observations**, Paiements, **Paiements List**, Domiciliation, **Historique Dom.** | 15 catégories sans Documents / Observations / Historique Dom. |

**3 catégories n'existent pas chez nous** : Documents, Observations, Historique Domiciliation.
Les compteurs exigent soit 10 requêtes au chargement de la sidebar, soit **un endpoint de
comptages** → **backend**.

---

## 5. ÉCARTS DE LOGIQUE MÉTIER

| # | Écart | Détail | Backend ? |
|---|---|---|---|
| L1 | **Mécanisme de renouvellement** | La référence gère les statuts **Nouveau** et **Renouveler** (légende du graphique, calendrier). Le modèle n'a rien pour ça | 🔴 **Oui** — migration |
| L2 | **« Ancienne Date de depart » / « Ancienne Date de fin »** | Deux champs grisés en haut de Nouvelle Domiciliation, qui rappellent la période précédente de l'entreprise choisie. **Absents chez nous** | 🟠 Probablement non (déductible de l'historique) |
| L3 | **Prix Totale en lecture seule** | Grisé et calculé dans la référence ; **éditable** chez nous sur Nouvelle Domiciliation | 🟢 Non |
| L4 | **Prix Par Mois pré-rempli** | 104,17 par défaut, venant de `domiciliation_settings.prix_domiciliation` | 🟢 Non |
| L5 | **Formule du Prix Total** | À trancher : `× Mois Payée` (projet) ou `× (Mois Payée + Mois Gratuits)` (demandé) | 🟢 Non — **décision métier** |
| L6 | **Calendrier de domiciliation** | Page réelle dans la référence ; **mock** chez nous | 🔴 Oui (dépend de L1) |
| L7 | **Cachet sur les factures** | Le drapeau signature doit imprimer le cachet | 🟢 Fait — **bloqué par `storage:link`** |
| L8 | **Cachet par centre** | La référence laisse penser à un cachet par centre ; chez nous `centres_domiciliation` n'a **aucune** colonne signature (cachet global) | 🔴 Oui — migration |
| L9 | **Liste Noire / Bloquer** | Permissions présentes, fonctionnalité absente | 🔴 Oui |
| L10 | **Création à la volée** | Boutons « + » créant un Client / Secteur / Service sans quitter le formulaire | 🟢 Non (modale + API existantes) |
| L11 | **Archive : Documents / Observations / Historique Dom.** | Trois catégories inexistantes | 🔴 Oui |
| L12 | **Compteurs d'archive** | Voir A1 | 🟠 Oui (ou 10 requêtes) |
| L13 | **Recherche globale** | Limitée à Clients/Entreprises chez nous | 🟢 Non |
| L14 | **Soumission atomique** entreprise + domiciliation | Deux appels successifs chez nous, non transactionnels | 🟠 Oui pour l'atomicité |

---

## 6. Modules NON AUDITÉS (captures non dépouillées)

Facturation listes (38-46) · Mouvement (53-56) · Déclaration TVA (57-61) ·
Chiffre d'Affaire (62-63) · Rapports (64-65) · Cachets (66) · Mails (67) ·
Data Center (68) · Corbeille (70) · Paramètres Bureau/Centre/Services/Cachet/Mail (72-78) ·
Assistance, suite (80-90) · Chat (32) · Services (33) · Services en cours (34).

**Aucune conclusion n'est tirée sur ces modules.** Il faut une passe écran par écran.

---

## 7. Plan pour atteindre la parité

### Lot A — Style transversal, sans backend
1. Titre + boutons **dans** la carte sur les 13 listes (S1)
2. Brancher `ActionMenu` : Afficher / Archive / Supprimer (S2)
3. Tableaux teintés par statut sur Domiciliation (S9)
4. Icône disquette sur les boutons Sauvegarder (S13)
5. Bordures colorées des totaux de facture (S8)

### Lot B — Formulaires au gabarit de référence, sans backend
6. Champs à icône + filet sur les 18 formulaires restants (S3)
7. Libellés **à gauche** sur Ajouter Entreprise (S4 / §3.2)
8. Cartes radio d'émetteur + interrupteurs violets (S5, S6)
9. Boutons « + » de création à la volée (S4, L10)
10. Prix Totale en lecture seule + Prix par mois pré-rempli (L3, L4)
11. Paramètre Account : onglets pilules, avatar carré, mentions (S11, S12)

### Lot C — Archive
12. Compteurs, pages par catégorie, bouton vert « Liste Normale » (A1)

### Lot D — Nécessite une décision, puis du backend
13. Mécanisme **Nouveau / Renouveler** (L1) → débloque le calendrier (L6) et le 4ᵉ tracé du graphique
14. Cachet **par centre** (L8)
15. Catégories d'archive Documents / Observations / Historique (L11)
16. Liste Noire / Bloquer (L9)
17. Soumission atomique (L14)

### Préalable immédiat
```bash
php artisan storage:link
```
`backend/public/storage` est un **dossier vide** au lieu d'un lien : aucune image téléversée
n'est servie (cachet, logos, photo de profil, documents). Rien de visuel impliquant une image
ne peut être conforme tant que ce point n'est pas réglé.

---

## 8. Décisions attendues

1. **Libellés de formulaire** : reproduire l'incohérence de la référence (à gauche sur
   Entreprise, au-dessus ailleurs) ou uniformiser ?
2. **Libellés de tableau** : revenir à l'anglais « Show / entries / Showing X to Y of Z » ?
3. **Formule du Prix Total** de domiciliation (L5) — question d'argent.
4. **Backend autorisé ou non** pour les points L1, L8, L9, L11, L14.
5. Dois-je **dépouiller les 74 captures restantes** pour compléter cet audit ?
