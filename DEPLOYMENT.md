# Déploiement de Bakhita Community

Ce guide décrit le déploiement recommandé : API Django et tâches de fond sur Render, interface web sur Vercel, PostgreSQL Neon, médias Cloudflare R2 et notifications web OneSignal. Le dépôt contient déjà les modèles Render et Vercel ; les comptes fournisseurs, domaines et secrets de production doivent être fournis par le propriétaire du projet.

Pour des instructions « clic par clic » de création des comptes et de saisie des réglages, consultez [GUIDE_DEPLOIEMENT_PAS_A_PAS.md](./GUIDE_DEPLOIEMENT_PAS_A_PAS.md).

## Architecture configurée

| Composant | Fournisseur | Configuration dans le dépôt |
| --- | --- | --- |
| API Django/ASGI | Render | `render.yaml` : service web Daphne, migrations au déploiement, worker Celery et Celery Beat |
| File, cache et WebSockets | Render Key Value/Redis | Provisionné par `render.yaml` |
| Interface web | Vercel | `vercel.json` : build Vite et relais API vers `bakhita-api.onrender.com` |
| Base de données | Neon PostgreSQL | `backend/config/settings.py` lit `DATABASE_URL` et désactive les curseurs serveur pour le pooler |
| Photos et pièces jointes | Cloudflare R2 | Stockage activé lorsque les variables `R2_*` sont renseignées |
| Notifications web | OneSignal | App ID public dans le build web, clé REST uniquement côté Render |
| Notifications Android | Firebase Cloud Messaging | Service account via `FCM_SERVICE_ACCOUNT_JSON` sur Render |

Les plans Render `starter` définis par le Blueprint sont payants. Vérifiez le coût des services, du stockage et des bases de données avant de les créer.

## 1. Préparer Neon

1. Créez un projet PostgreSQL dans Neon, dans une région proche de Render.
2. Récupérez la chaîne de connexion PostgreSQL directe, TLS activé (`sslmode=require`). Utilisez de préférence l’URL directe, et non l’URL du pooler, pour la commande de migration `preDeployCommand` du Blueprint.
3. Conservez la chaîne comme secret : elle contient le nom d’utilisateur et le mot de passe. Ne la mettez ni dans Git ni dans un fichier frontend.

L’application utilise `DATABASE_URL` pour le web et les workers Render ; le Blueprint partage cette variable avec les deux workers.

## 2. Déployer l’API et les workers sur Render

1. Importez le dépôt GitHub dans Render en tant que Blueprint et synchronisez `render.yaml`.
2. Lors de la création, renseignez les variables marquées `sync: false` pour le service web. Le Blueprint configure également le worker Celery et Celery Beat.
3. Au minimum, fournissez :
   - `DATABASE_URL` : chaîne Neon, TLS activé ;
   - `ALLOWED_HOSTS` : nom d’hôte Render de l’API et domaine Vercel, sans schéma (`https://`). Le domaine Vercel doit y figurer pour que la validation d’origine WebSocket l’accepte ;
   - `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, `FRONTEND_URL` et `SITE_URL` : origine Vercel de production. Ajoutez `https://` aux valeurs d’origine ;
   - les variables `R2_*` si les fichiers média doivent être conservés dans R2 ;
   - `ONESIGNAL_APP_ID` et `ONESIGNAL_REST_API_KEY` pour les notifications web ;
   - les variables SMTP (`BREVO_SMTP_LOGIN`, `BREVO_SMTP_PASSWORD`, `DEFAULT_FROM_EMAIL`) si les courriels doivent être envoyés.
4. Laissez `DJANGO_SECRET_KEY` être générée par Render. `TRUSTED_PROXY_IPS` est déjà défini dans le Blueprint aux plages privées utilisées par le proxy de confiance.
5. Attendez le déploiement puis vérifiez `https://<hôte-api>/api/vivant/`. L’URL et le nom d’hôte définitifs doivent être ceux réellement attribués par Render.
6. Dans le Shell du service web, exécutez une fois les commandes d’initialisation :

   ```sh
   python manage.py charger_referentiels
   python manage.py createsuperuser
   ```

Les migrations sont lancées automatiquement avant le déploiement du service web. N’exécutez pas ces commandes de production dans les workers.

## 3. Déployer l’interface sur Vercel

1. Importez le même dépôt dans Vercel et gardez **Root Directory** à la racine (`./`).
2. Les commandes et le répertoire de sortie sont déjà définis dans `vercel.json` : `npm --prefix frontend ci`, `npm --prefix frontend run build` et `frontend/dist`.
3. Ajoutez les variables de build nécessaires dans les environnements Vercel **Production** (et Preview uniquement si les domaines preview sont autorisés par l’API) :

   ```dotenv
   VITE_WS_URL=wss://<hôte-api-render>/ws/
   VITE_ONESIGNAL_APP_ID=<app-id-public-onesignal>
   VITE_GOOGLE_CLIENT_ID=<client-id-oauth-web-si-google-est-utilise>
   ```

   `VITE_WS_URL` doit désigner le vrai hôte API Render ; les WebSockets ne passent pas par le relais HTTP configuré dans `vercel.json`.
4. Les réécritures de `vercel.json` ciblent actuellement `https://bakhita-api.onrender.com`. Si le nom du service Render ou son domaine change, mettez à jour toutes les destinations Render du fichier. Vercel ne remplace pas automatiquement ces destinations par une variable d’environnement.
5. Après le premier déploiement, copiez l’origine Vercel réelle (sans chemin) dans les variables d’origine CORS/CSRF et les URL de site côté Render, puis redéployez l’API.
6. Si l’origine publique Vercel change, vérifiez le domaine OneSignal et le domaine public R2, puis reconstruisez le frontend avec les nouvelles variables.

## 4. Configurer Cloudflare R2

1. Créez un bucket R2 et un jeton d’accès dédié, limité à ce bucket avec les permissions de lecture/écriture nécessaires.
2. Configurez un domaine public personnalisé pour servir les médias et activez son certificat TLS.
3. Renseignez côté Render :

   ```dotenv
   R2_ACCOUNT_ID=<identifiant-du-compte>
   R2_ACCESS_KEY_ID=<identifiant-du-jeton>
   R2_SECRET_ACCESS_KEY=<secret-du-jeton>
   R2_BUCKET=<nom-du-bucket>
   R2_PUBLIC_DOMAIN=<domaine-public-sans-schema>
   ```

`R2_PUBLIC_DOMAIN` est l’hôte utilisé dans les URL de médias, sans `https://`. Les objets servis par ce domaine doivent être lisibles par les clients de l’application. Ne publiez pas les clés d’accès. Vérifiez qu’un téléversement depuis l’application produit un objet accessible via le domaine configuré.

## 5. Configurer OneSignal

1. Créez une application OneSignal avec la plateforme Web Push pour le domaine Vercel public de production.
2. Copiez l’App ID public dans `VITE_ONESIGNAL_APP_ID` sur Vercel et configurez le même App ID dans `ONESIGNAL_APP_ID` sur Render.
3. Déposez la REST API Key dans `ONESIGNAL_REST_API_KEY` sur Render seulement. **Ne préfixez jamais cette clé par `VITE_`** et ne l’incluez pas dans le bundle frontend.
4. Vérifiez que le service worker est servi sous `/onesignal/OneSignalSDKWorker.js`, puis autorisez les notifications et vérifiez l’association d’un appareil à un compte.

Les notifications Android natives reposent séparément sur Firebase : ajoutez le JSON du compte de service dans le secret Render `FCM_SERVICE_ACCOUNT_JSON` si cette fonction est utilisée.

## 6. Vérifications après déploiement

- `/api/vivant/` répond avec succès et l’administration Render s’ouvre sur l’URL configurée.
- La connexion, les sessions/cookies et les requêtes API fonctionnent depuis le domaine Vercel.
- Les WebSockets se connectent à `wss://<hôte-api-render>/ws/`.
- Un média téléversé est conservé dans R2 et son URL utilise le domaine public configuré.
- Une notification web de test arrive après autorisation OneSignal.
- Les workers Celery et Celery Beat sont actifs dans Render.
- Les migrations et la commande `charger_referentiels` se terminent correctement.

## Secrets et changements de domaine

Configurez les secrets directement dans les consoles Render, Vercel, Neon, Cloudflare, OneSignal et Firebase. Ne commitez aucun secret, n’utilisez aucune valeur d’exemple en production et ne stockez aucune clé privée dans une variable `VITE_*` : les variables Vite sont incorporées au JavaScript public.

Le dépôt ne peut pas terminer le déploiement fournisseur à votre place sans accès aux comptes, au domaine final Vercel et à l’hôte Render confirmé. Une fois les domaines créés, remplacez les valeurs d’exemple de ce guide par les domaines réels dans les consoles et dans `vercel.json`, puis vérifiez les points ci-dessus.
