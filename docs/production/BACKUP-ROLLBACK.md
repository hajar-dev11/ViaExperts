# Sauvegarde, déploiement et retour arrière — Via Experts

> **Statut : documentation uniquement.** Aucune sauvegarde, aucun déploiement ni aucun retour arrière n'a été exécuté sur LWS.
> Les commandes ci-dessous sont des modèles : **les répéter d'abord sur une pré-production** (copie de la base + des fichiers)
> avant le premier déploiement réel.

Ce qu'il faut protéger — trois choses, à sauvegarder **ensemble** (elles se référencent mutuellement) :

1. **La base de données MySQL** (clients, entreprises, documents, paiements…).
2. **Les fichiers téléversés** : `backend/storage/app/public/` (les chemins sont enregistrés en base).
3. **Le `.env` de production** (hors dépôt, contient les secrets) — copie chiffrée, stockée ailleurs que sur le serveur web.

Le code, lui, est versionné dans Git : **noter le commit ou le tag déployé** suffit à le retrouver.

---

## A. Avant chaque déploiement

1. **Sauvegarde MySQL** (cohérente, sans verrouiller l'application) :
   ```bash
   mysqldump --single-transaction --routines --no-tablespaces -h HOTE -u UTILISATEUR -p NOM_BASE \
     | gzip > ~/sauvegardes/via_experts_$(date +%Y-%m-%d_%H%M).sql.gz
   ```
   (le mot de passe est demandé interactivement, ou fourni par un fichier `~/.my.cnf` en `chmod 600` ; jamais en argument visible.)
2. **Sauvegarde des fichiers téléversés** :
   ```bash
   tar -czf ~/sauvegardes/uploads_$(date +%Y-%m-%d_%H%M).tar.gz -C /chemin/vers/backend/storage/app public
   ```
3. **Vérifier les sauvegardes** — une sauvegarde non testée n'existe pas :
   - taille non nulle, `gzip -t fichier.sql.gz`, `tar -tzf uploads_….tar.gz | head` ;
   - calculer et noter l'empreinte : `sha256sum ~/sauvegardes/*` ;
   - **au moins la première fois** : restaurer le dump dans une base temporaire (`CREATE DATABASE via_experts_verif;`) et compter les
     tables (`SHOW TABLES;`) puis supprimer cette base temporaire.
4. **Copier les sauvegardes hors du serveur** (poste local chiffré, stockage distant) : une sauvegarde qui reste sur le serveur
   disparaît avec lui.
5. **Noter la version en place** : `git -C /chemin/vers/projet rev-parse HEAD` et `git describe --tags` → à inscrire dans le journal
   de déploiement, avec la date et l'heure.
6. **Vérifier le `.env`** : copie de sécurité faite (hors dépôt) ; `php artisan production:verifier` ne signale rien de bloquant ;
   le nouveau code n'exige pas de **nouvelle variable** absente du `.env` (comparer avec `docs/production/env.production.example`).
7. **Lister les migrations à venir** : `php artisan migrate:status` — lire chaque migration en attente ; si l'une supprime ou
   transforme des colonnes, la retour arrière du code seul ne suffira pas (voir §C).

## B. Déploiement

1. **Maintenance si nécessaire** (migration lourde ou incompatible avec l'ancien code) :
   `php artisan down --retry=60`.
2. **Déployer le code** : checkout du **tag** voulu (jamais une branche mouvante) ou envoi de l'archive. Ne jamais écraser `.env`
   ni `storage/app/public`.
3. **Dépendances sans outils de développement** :
   `composer install --no-dev --optimize-autoloader`.
4. **Migrations** : `php artisan migrate --force` (seulement s'il y en a ; `--pretend` affiche le SQL sans l'exécuter).
5. **Caches** : `php artisan config:cache && php artisan route:cache`.
6. **Lien des fichiers** : `php artisan storage:link` (première installation seulement).
7. **Remettre en service** : `php artisan up` (si l'étape 1 a été faite).
8. **Tests de fumée** (voir §D). **Ne pas annoncer la fin du déploiement avant qu'ils soient passés.**

## C. Retour arrière (rollback)

> **Règle absolue : ne jamais restaurer la base ni lancer `migrate:rollback` sans avoir d'abord sauvegardé l'état ACTUEL.**
> Restaurer écrase les données saisies depuis le déploiement ; sans cette sauvegarde, elles seraient perdues définitivement.

1. **Mettre en maintenance** : `php artisan down`.
2. **Remettre le code précédent** : checkout du tag noté à l'étape A.5, puis `composer install --no-dev --optimize-autoloader`.
   Dans la grande majorité des cas (pas de migration, ou migration purement additive), **c'est tout** : passer au point 5.
3. **Restaurer la base — seulement si une migration est incompatible avec l'ancien code** :
   1. Sauvegarder d'abord l'état actuel (A.1) sous un nom distinct (`avant_rollback_…`).
   2. Restaurer le dump pré-déploiement : de préférence **dans une nouvelle base**, puis pointer `DB_DATABASE` vers elle ; sinon
      `gunzip -c via_experts_….sql.gz | mysql -h HOTE -u UTILISATEUR -p NOM_BASE` (écrase les tables existantes).
   3. Ne pas utiliser `migrate:rollback` en production : les méthodes `down()` de ce projet suppriment des colonnes/tables.
4. **Restaurer les fichiers téléversés — seulement si nécessaire** (fichiers perdus ou écrasés) : extraire l'archive **dans un
   dossier temporaire**, vérifier, puis copier uniquement ce qui manque (`cp -n` / `rsync --ignore-existing`). Ne jamais vider
   `storage/app/public` avant restauration.
5. **Vider et reconstruire les caches** : `php artisan optimize:clear` puis `php artisan config:cache && php artisan route:cache`.
6. `php artisan up`, puis **tests de fumée** (§D).
7. Consigner dans le journal : cause, version restaurée, heure, données éventuellement perdues.

## D. Tests de fumée (après déploiement **et** après retour arrière)

- [ ] `https://api.votre-domaine/` répond `{"status":"ok"}` ; `/.env`, `/vendor/autoload.php`, `/storage/logs/laravel.log` répondent 404.
- [ ] Connexion et déconnexion avec un compte administrateur ; un mauvais mot de passe est refusé.
- [ ] « Mot de passe oublié » : l'email arrive réellement (SMTP) ; le lien ouvre la page de réinitialisation.
- [ ] Liste des clients / entreprises / factures s'affichent sans bannière d'erreur.
- [ ] Créer une facture de test, y enregistrer un paiement, imprimer le PDF (logo et cachet visibles), puis la supprimer ou l'archiver.
- [ ] Téléverser un fichier, le retrouver, le supprimer.
- [ ] Un utilisateur **non administrateur** ayant seulement la permission de facturation peut imprimer une facture.
- [ ] `php artisan production:verifier` : aucun point bloquant.
- [ ] Les journaux (`storage/logs`) ne montrent aucune erreur nouvelle.

## E. Routine de sauvegarde en exploitation

| Quoi | Fréquence | Conservation | Contrôle |
|---|---|---|---|
| Dump MySQL | quotidien (cron LWS) + avant chaque déploiement | 14 jours + 1 par semaine pendant 3 mois | taille/empreinte, alerte si absent |
| Fichiers téléversés | quotidien (incrémental possible) + avant déploiement | idem | `tar -tzf` |
| `.env` | à chaque modification | version courante + précédente | copie chiffrée hors serveur |
| Restauration d'essai | **mensuelle** (base temporaire) | — | tables et dernières lignes présentes |

## F. Niveau de risque actuel

| Point | État |
|---|---|
| Sauvegardes locales manuelles (dump + uploads + SHA-256) | existantes (poste de développement) |
| Sauvegarde automatique sur LWS | **à mettre en place** (cron + copie hors serveur) |
| Restauration testée sur LWS | **à faire** avant le premier déploiement |
| Script de déploiement avec retour arrière | **non fourni** : la procédure ci-dessus est manuelle |

Tant que la restauration n'a pas été testée sur la pré-production, considérer le risque comme **élevé**.
