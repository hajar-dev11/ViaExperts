# Fuseau horaire Africa/Casablanca et refus du surpaiement

Date : 7 octobre 2026. Sauvegarde préalable : `C:\Users\hajar\Backups\ViaExperts\2026-10-07_avant-preparation-production\` (hors du projet : dump MySQL complet, uploads, empreintes SHA-256 ; restauration vérifiée).

## 1. Fuseau horaire

`config/app.php` : `'timezone' => 'Africa/Casablanca'` (au lieu de `UTC`). Heure légale du Maroc : UTC+1, UTC+0 pendant le Ramadan (gérée par la base de fuseaux de PHP).

**Endroits concernés (recensés par recherche dans le code)**
- Backend : `now()`, `today()`, `Carbon::` (dernière opération des cachets / courriers / services en cours, date de lecture du chat, droits accordés, expiration des domiciliations, année des numéros de documents) utilisent désormais l'heure du Maroc. Aucun autre fuseau n'est codé en dur.
- Interface : `Cachets.jsx` et `Mails.jsx` envoyaient l'heure de départ en **UTC** (`toISOString()`), alors que le serveur écrit sa « dernière opération » dans le fuseau de l'application : elles envoient maintenant l'heure **locale** (`maintenantLocal()`, `shared/utils/date.js`). `Rapports.jsx` utilise la date locale du jour (corrigé à l'étape 23). `ServicesEnCours.jsx` envoyait déjà l'heure locale.
- Les champs « date » saisis (date de facture, date de paiement, début / fin de domiciliation…) ne sont jamais convertis.

**Impact sur les données déjà enregistrées (aucune donnée n'a été modifiée)**
- Les horodatages **créés par le serveur avant ce changement** sont en UTC : `created_at` / `updated_at` de toutes les tables, `derniere_operation`, `read_at` (chat), `granted_at` (droits). Dans la base locale : environ 1 280 lignes dans 36 tables, créées entre le 16 septembre et le 6 octobre 2026.
- Après le changement, ces anciennes valeurs sont lues comme de l'heure locale : une ligne enregistrée à « 10:00 » (UTC, soit 11:00 à Casablanca) s'affichera **10:00**, donc **1 heure plus tôt que l'heure réelle**. Seules les lignes antérieures sont concernées ; les nouvelles sont exactes. Aucun changement de date calendaire, sauf pour une ligne créée entre 23:00 et 00:00 UTC (rare).
- Les dates des documents, des paiements et des domiciliations (champs « date ») ne bougent pas.
- Si l'heure exacte des anciens enregistrements compte, il faut décaler de +1 h ces colonnes (ou accepter l'écart). Cela n'a **pas** été fait ici (demande : ne pas modifier inutilement les données).
- La colonne `TIMESTAMP` de MySQL est écrite et relue en texte `AAAA-MM-JJ HH:mm:ss` : le fuseau du serveur MySQL n'ajoute aucun décalage supplémentaire pour l'application.

## 2. Refus du surpaiement (côté serveur)

Un paiement ne peut plus dépasser le reste à payer. Refus : HTTP 422, champ `prix_paye`, message en français, **rien n'est créé ni modifié**.
- Reste à payer d'une facture = total TTC − somme des paiements **actifs** déjà enregistrés (les paiements archivés ou en corbeille ne comptent pas).
- Un paiement ne peut pas non plus dépasser le total de ses propres lignes.
- Messages :
  - « Le montant payé (300,00 Dh) dépasse le reste à payer de la facture n° FAC-001 (200,00 Dh). Le paiement n'a pas été enregistré. »
  - « Le montant payé (500,00 Dh) dépasse le total du paiement (300,00 Dh). Le paiement n'a pas été enregistré. »
- S'applique à la création, à la modification (montant en hausse, total en baisse ou changement de facture) et à la restauration d'un paiement archivé. Une ancienne donnée déjà en dépassement reste modifiable tant qu'on ne l'aggrave pas (un paiement du jeu de démonstration, `#D2`, est dans ce cas et n'a pas été touché).
- Nouveau contrat public de Facturation `MontantFacture` (`totalTtc()`) : Paiements ne lit pas la table des documents.
- Vérification faite sous le verrou de création des paiements : deux paiements simultanés ne peuvent pas dépasser ensemble le reste (test à vrais processus : 24 demandes de 100 Dh pour 1 000 Dh à payer → exactement 10 acceptées, 14 refusées, 0 erreur 500).

## 3. Tests ajoutés / adaptés
- `PaiementSurpaiementTest` (14), `FuseauHoraireTest` (3), `PaiementConcurrenceTest` (+1), `corrections-audit.test.js` (+2).
- Adaptés : 4 tests de `PaiementTest` dont les données payaient plus que le total sans l'avoir voulu (montants rendus cohérents) ; liste des consommateurs de `shared/utils/date.js`.
