# Fichiers téléversés — analyse et décision

## Constat

Tous les fichiers téléversés sont écrits sur le disque `public` (`backend/storage/app/public/`) et servis **sans authentification**
par le serveur web via le lien `public/storage` (URL `…/storage/<dossier>/<nom aléatoire>`). Vérifié le 2026-10-08 : quatre fichiers
réels (fichiers, rapports, cachets) répondent `200` sans session.

Protections en place : noms aléatoires de 40 caractères (non devinables), `Options -Indexes`, exécution de scripts interdite dans
`/storage` (`.htaccess` de `public/` et du dossier), `X-Content-Type-Options: nosniff`, `X-Robots-Tag: noindex`, liste blanche
d'extensions avec contrôle du type réel (`FichierAutorise`), refus des doubles extensions, SVG et HTML.

**Risque résiduel** : toute personne qui obtient une URL (message transféré, journal du serveur, historique de navigateur,
capture d'écran) peut ouvrir le document **sans être connectée et même après la révocation de ses droits**.

## Classement des fichiers

| Dossier | Contenu | Écrit par | Lu aujourd'hui par | Sensibilité |
|---|---|---|---|---|
| `entreprises/`, `entreprises/observations/` | Documents et pièces d'entreprise | `EntrepriseController` (permissions `entreprises.*`) | route `…/download` **et** lien direct | **Très élevée** (statuts, pièces d'identité probables) |
| `domiciliations/`, `…/operations/`, `…/observations/` | Contrats, attestations, pièces d'opérations | `DomiciliationController` | routes `download` (opérations, observations) ; lien direct (documents) | **Élevée** |
| `paiements/` | Justificatifs de paiement | `PaiementController` | lien direct | **Élevée** (données financières) |
| `rapports/` | Rapports | `RapportController` | route `…/document` **et** lien direct | **Élevée** |
| `mails/` | Courriers scannés | `MailController` | lien direct | **Élevée** |
| `services-en-cours/`, `cachets/` | Pièces d'opérations | contrôleurs dédiés | lien direct | Moyenne à élevée |
| `fichiers/` | Fichiers personnels de l'utilisateur (outil de la barre supérieure) | `FichierController` (propriétaire ou admin) | lien direct | Moyenne à élevée (contenu libre) |
| `chat/` | Pièces jointes de la messagerie interne | `ChatController` | lien direct | Moyenne à élevée (privé entre deux utilisateurs) |
| `settings/cabinet`, `settings/domiciliation` | Logo, cachet/signature des documents | Paramètres | lien direct + route `/settings/fichier` (PDF) | Moyenne (un cachet permet de falsifier un document) |
| `profiles/` | Photos de profil | `ProfileController` | lien direct | Faible |

## Décision : **non implémenté dans ce lot** — à planifier

Le passage à un stockage privé n'a **pas** été réalisé, parce qu'il ne peut pas l'être « proprement sans rien casser » dans ce lot :

1. **Surface de changement large** : une vingtaine de points d'écriture côté serveur (`store(…, 'public')`) et une quinzaine de
   points de lecture côté interface (`<a href="${API_URL}/storage/…">`, `<img src=…>` dans Chat, Cachets, Mails, Services en cours,
   Paiements, Fichiers, Dashboard, Détails de domiciliation, barre supérieure, Paramètres).
2. **Autorisation à concevoir par module** : un lien « signé par la session » n'est pas suffisant ; chaque type de fichier a sa
   règle (permission du module, propriétaire du fichier, expéditeur/destinataire du chat…). Une règle trop large (« tout utilisateur
   connecté ») améliorerait la situation sans corriger l'IDOR entre utilisateurs.
3. **Comportement navigateur à valider sur le vrai domaine** : un lien ou une image cross-origin vers une route authentifiée dépend
   du cookie de session (`SameSite=Lax`) et de l'en-tête `Referer` (contrôle « requête du frontend » de Sanctum). La solution robuste
   (récupération par `fetch` avec identifiants puis affichage via `blob:`) change le comportement de chaque lien (aperçu, nouvel
   onglet, téléchargement) et doit être testée module par module.
4. **Fichiers existants** : les chemins sont enregistrés en base ; déplacer des fichiers déjà téléversés est une opération sur des
   données réelles qui doit être répétée sur une copie.

Le périmètre demandé exigeait de ne pas casser PDF, aperçus et téléchargements : le risque de régression est supérieur au gain tant
que l'application n'est pas en production avec des données réelles à protéger.

## Plan recommandé (lot dédié, avant d'importer des documents réels sensibles)

1. **Disque privé** : ajouter un disque `prive` (`storage/app/private`, non exposé) et un service unique `StockageFichiers`
   (écriture, suppression, flux) pour que les contrôleurs ne manipulent plus `Storage::disk('public')` directement.
2. **Routes authentifiées** par ressource, avec les permissions existantes :
   `GET /entreprises/{e}/documents/{d}/download` (existe déjà), `…/paiements/{p}/piece-jointe`, `…/mails/{m}/fichiers/{f}`,
   `…/chat/messages/{m}/fichier` (expéditeur/destinataire), `…/fichiers/{f}/telecharger` (propriétaire/admin), etc.
3. **Frontend** : un seul assistant `ouvrirFichierProtege(url)` (fetch avec identifiants → `blob:` → nouvel onglet ou téléchargement)
   à la place des liens directs ; images de profil/logos servies par une route dédiée ou laissées publiques (faible sensibilité).
4. **Migration des données existantes** : commande Artisan idempotente déplaçant `storage/app/public/<dossier>` vers
   `storage/app/private/<dossier>` (les chemins en base ne changent pas), exécutée d'abord sur une copie, avec comparaison
   d'empreintes avant/après.
5. **Production** : ne **pas** créer `public/storage` ; `production:verifier` contrôlera alors son **absence** ; tests PHPUnit
   (accès refusé sans session, sans permission, et au fichier d'un autre utilisateur) + tests navigateur (upload, aperçu,
   téléchargement, PDF avec logo et cachet).

## En attendant (mesures disponibles sans modifier le code)

- Ne pas importer de documents réels sensibles avant ce lot, ou accepter explicitement le risque résiduel ci-dessus.
- Ne jamais partager d'URL `/storage/…` ; ne pas les copier dans des messages ou tickets.
- Sur LWS : si le serveur le permet, restreindre `/storage` par une règle d'accès (liste d'adresses IP du cabinet) — à vérifier, car
  cela casse l'affichage hors du réseau du cabinet.
- Conserver `.htaccess` (scripts interdits, `-Indexes`, `nosniff`) : ne jamais le supprimer du dossier des fichiers.
