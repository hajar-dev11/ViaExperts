# Configuration de production — Via Experts

Ce document décrit **ce qui doit être configuré sur le serveur** (LWS ou autre) et pourquoi. Rien ici n'est écrit dans le
code : tout passe par des variables d'environnement. **Le vrai `.env` ne doit jamais être commité**, et ce dépôt n'en
contient aucun.

> Contrôle automatique : une fois le `.env` de production en place, lancer sur le serveur
> `php artisan production:verifier` (lecture seule, n'affiche aucun secret, code de sortie 1 s'il reste un point bloquant).

## 1. Architecture attendue

| Élément | Rôle | Remarque |
|---|---|---|
| Frontend (React, build statique) | `https://app.votre-domaine` | Servi tel quel (dossier `frontend/dist`). Routage par `#` : aucune réécriture d'URL nécessaire. |
| API (Laravel) | `https://api.votre-domaine` | Le **document root** doit être `backend/public`, jamais la racine du projet. |

**Règle impérative : le frontend et l'API doivent partager le même domaine racine** (`app.` et `api.` d'un même domaine, ou
même hôte). Le cookie de session est `SameSite=Lax` (Sanctum le force) : sur deux domaines racines différents, le navigateur
n'enverrait pas le cookie et la connexion échouerait.

## 2. Variables du backend (`backend/.env` sur le serveur)

| Variable | Valeur en production | Pourquoi |
|---|---|---|
| `APP_ENV` | `production` | Active les garde-fous (ex. `DemoDataSeeder` interdit). |
| `APP_DEBUG` | `false` | Sinon les erreurs détaillées (chemins, requêtes) sont visibles. |
| `APP_KEY` | générée **une seule fois** (`php artisan key:generate`) | Ne jamais la changer ensuite : toutes les sessions et cookies chiffrés deviendraient invalides. |
| `APP_URL` | `https://api.votre-domaine` | URL publique HTTPS de l'API. Détermine aussi `SESSION_SECURE_COOKIE` quand il n'est pas défini. |
| `FRONTEND_URL` | `https://app.votre-domaine` | **Sans chemin ni `/` final.** Origine autorisée par CORS **et** base du lien de l'email de réinitialisation. |
| `SANCTUM_STATEFUL_DOMAINS` | `app.votre-domaine` | Sans schéma ni chemin. À définir explicitement : sans cela Sanctum retombe sur `localhost`, `127.0.0.1`… |
| `SESSION_DOMAIN` | `.votre-domaine` si `app.` et `api.` sont des sous-domaines ; vide si même hôte | Pour que le cookie soit visible des deux côtés. |
| `SESSION_SECURE_COOKIE` | `true` | Cookie envoyé uniquement en HTTPS. Si la variable est absente, il vaut `true` dès que `APP_URL` commence par `https://`. |
| `SESSION_SAME_SITE` | `lax` | Voir §1. |
| `SESSION_DRIVER` | `file` (défaut) ou `database` | `file` suffit sur un serveur unique ; vérifier que `storage/framework/sessions` est inscriptible. |
| `DB_*` | identifiants fournis par LWS | Utilisateur MySQL dédié, mot de passe fort, droits limités à cette base. |
| `MAIL_MAILER` | `smtp` | **Jamais `log`/`array`** : « mot de passe oublié » n'enverrait aucun email. |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_ENCRYPTION`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` | ceux du fournisseur SMTP | `MAIL_FROM_ADDRESS` doit appartenir à un domaine réel (SPF/DKIM configurés). |
| `LOG_LEVEL` | `warning` ou `error` | `debug` écrit énormément et peut laisser des données dans les journaux. |
| `TRUSTED_PROXIES` | **vide** (cas habituel), voir §4 | Uniquement derrière un proxy/CDN. |
| `SECURITY_HEADERS_ENABLED`, `SECURITY_HSTS_ENABLED`, `SECURITY_HSTS_MAX_AGE` | défauts (activés, 1 an) | Voir §5. |
| `BOOTSTRAP_ADMIN_NAME/EMAIL/PASSWORD` | **à retirer** après la création du premier administrateur | Voir §7. |

Un exemple prêt à remplir est fourni dans [`env.production.example`](env.production.example) (sans aucune valeur secrète).

### Variable du frontend (au moment du **build**)

`VITE_API_URL=https://api.votre-domaine` — injectée dans le code à la compilation. Le build de production **refuse** une valeur
absente, locale (`localhost`, `127.0.0.1`), privée (`10.x`, `172.16-31.x`, `192.168.x`…), une adresse IP, un nom réservé
(`.test`, `.local`, `.localhost`, `.internal`…), un nom sans point, une URL d'exemple ou une URL **non HTTPS**.

```bash
cd frontend
VITE_API_URL=https://api.votre-domaine npm run build     # PowerShell : $env:VITE_API_URL='https://…'; npm run build
```

> Attention : Vite lit aussi `frontend/.env` et `frontend/.env.production`. Un `frontend/.env` de développement contenant
> `http://localhost:8000` ferait **échouer** le build (c'est le comportement voulu) — la variable d'environnement du processus
> a priorité sur ces fichiers.

## 3. Sessions, cookies et mots de passe

- **Cookies** : `HttpOnly`, `SameSite=Lax`, `Secure` en production. Le jeton CSRF (`XSRF-TOKEN`) suit les mêmes réglages.
- **Politique de mot de passe** (création de compte, changement de mot de passe, réinitialisation) : **12 caractères minimum, au
  moins une lettre et un chiffre**, et pas une suite de caractères répétés. Les comptes existants ne sont pas modifiés : seul un
  nouveau mot de passe est contrôlé ; la connexion n'applique aucune règle.
- **Invalidation des sessions** : à chaque changement de mot de passe (par l'utilisateur, par l'administrateur ou par
  réinitialisation), toutes les **autres** sessions du compte sont fermées à leur prochaine requête et le jeton « se souvenir de
  moi » est renouvelé. L'utilisateur qui change son propre mot de passe reste connecté sur l'appareil qu'il utilise.
- **Changement d'adresse email** (`PUT /profile`) : exige le **mot de passe actuel** (comme le changement de mot de passe), avec une
  limitation à 10 essais par minute.
- **Réinitialisation** : la réponse de `POST /auth/forgot-password` est identique que le compte existe ou non et que l'envoi du
  mail réussisse ou échoue. L'envoi se fait après la réponse ; une panne SMTP est journalisée (`storage/logs`) sans adresse, sans
  jeton ni lien.

## 4. Proxys de confiance (`TRUSTED_PROXIES`)

- **Vide (défaut)** : aucun en-tête `X-Forwarded-*` n'est cru. C'est le bon réglage si Apache/PHP reçoit lui-même la connexion
  HTTPS (hébergement mutualisé classique).
- **Adresses précises** (`TRUSTED_PROXIES=203.0.113.10,203.0.113.11`) : seuls ces proxys sont crus. Réglage recommandé derrière un
  répartiteur de charge ou un CDN dont on connaît les adresses. `REMOTE_ADDR` désigne l'appelant direct.
- **`*`** : croit n'importe quel appelant. À éviter : si l'application reste joignable directement, n'importe qui peut falsifier
  `X-Forwarded-For` (contournement du blocage anti-force-brute par IP) ou `X-Forwarded-Proto`.

Symptôme d'un mauvais réglage derrière un proxy HTTPS : `isSecure()` faux → pas de HSTS, cookies non `Secure`, liens générés en
`http://`.

## 5. En-têtes de sécurité HTTP

### API (Laravel, middleware `SecurityHeaders`, réglable dans `config/security.php`)

| En-tête | Valeur | Statut |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Nécessaire |
| `X-Frame-Options` | `DENY` (l'API n'est jamais affichée dans un cadre) | Nécessaire |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Recommandé |
| `Strict-Transport-Security` | `max-age=31536000`, **uniquement sur une requête HTTPS** | Nécessaire en production |

HSTS n'est **jamais** envoyé en HTTP (développement local compris). Une fois reçu, le navigateur refuse HTTP sur ce domaine pendant
un an : ne l'activer qu'après avoir vérifié que le HTTPS fonctionne partout (désactivable avec `SECURITY_HSTS_ENABLED=false`).
`includeSubDomains` et `preload` ne sont volontairement **pas** activés.

### Frontend (fichiers statiques — à poser côté serveur web)

Le frontend n'est pas servi par Laravel : ses en-têtes se règlent dans le serveur web du site. Exemple Apache
(`frontend/dist/.htaccess`, à adapter et à tester sur la pré-production) :

```apache
<IfModule mod_headers.c>
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
    Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"
    Header always set Strict-Transport-Security "max-age=31536000" env=HTTPS
</IfModule>
```

`SAMEORIGIN` (et non `DENY`) est compatible avec la génération des PDF, qui rend le document dans une iframe de la même page.

### Content-Security-Policy — évaluation (non activée)

Une CSP stricte **n'est pas activée** : elle peut casser silencieusement la génération des PDF ou les polices. Proposition à tester
d'abord en **`Content-Security-Policy-Report-Only`** sur la pré-production :

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: blob: https://api.votre-domaine;
connect-src 'self' https://api.votre-domaine;
frame-src 'self' blob:;
object-src 'none'; base-uri 'self'; form-action 'self'
```

Points à vérifier avant de la rendre bloquante : styles en ligne (React/Tailwind → `'unsafe-inline'` nécessaire), Google Fonts
(chargées depuis `fonts.googleapis.com` / `fonts.gstatic.com` — alternative : héberger les polices soi-même), rendu des PDF (iframe
`about:blank` + `data:`/`blob:`), affichage des images du dossier `/storage` de l'API. Aucune CSP n'est posée sur l'API : ses
réponses sont du JSON ou des fichiers (PDF, images) que le lecteur du navigateur doit pouvoir afficher.

## 6. Dépôt, dépendances et déploiement

- Installer sans les outils de développement : `composer install --no-dev --optimize-autoloader` (sinon des routes de debug comme
  `/_ignition` peuvent exister).
- `composer.phar` n'est plus versionné : télécharger Composer sur <https://getcomposer.org> (ou utiliser celui de l'hébergeur).
- Mettre en cache : `php artisan config:cache` puis `php artisan route:cache` (compatibles avec ce projet).
- `php artisan storage:link` (voir [UPLOADS-ANALYSE.md](UPLOADS-ANALYSE.md) pour la question de l'accès public aux fichiers).
- Ancien mot de passe d'administrateur présent dans l'historique Git (commits `fda5dd7`, `a2ef616`) : **il doit être considéré
  comme compromis et invalidé**. L'historique n'est pas réécrit ; ne jamais réutiliser ce mot de passe.

## 7. Premier administrateur et données de démonstration

1. Sur une base **neuve** : `php artisan migrate --force`.
2. Définir temporairement dans le `.env` : `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (mot de passe
   généré par vos soins, 12 caractères minimum, jamais commité ni envoyé par message).
3. `php artisan db:seed --force` → crée l'administrateur (avec mot de passe haché) **et** le catalogue de permissions. Sans ces
   variables, aucun compte n'est créé (les permissions le sont quand même).
4. **Retirer `BOOTSTRAP_ADMIN_*` du `.env`**, puis `php artisan config:cache`. Rejouer le seeder ne change jamais le mot de passe
   d'un compte existant.
5. Se connecter et créer les autres comptes depuis l'application. Vérifier avec `php artisan production:verifier`.

`DemoDataSeeder` lève une exception si `APP_ENV=production` : aucune donnée de démonstration ne peut être créée en production.
**Ne jamais importer la base de développement** : elle contient des entreprises « DEMO », des comptes `*@demo.viaexperts.test` et
des périodes de domiciliation qui se chevauchent.

## 8. Contrôle final avant ouverture

```bash
php artisan production:verifier          # tout doit être ✓ (les « ! » sont des avertissements)
php artisan route:list --except-vendor   # aucune route de debug
curl -sI https://api.votre-domaine/.env  # doit répondre 404
```
