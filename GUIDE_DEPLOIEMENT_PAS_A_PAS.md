# Guide pas à pas : créer les comptes et déployer Bakhita Community

Ce document accompagne le guide technique [DEPLOYMENT.md](./DEPLOYMENT.md). Il indique où s’inscrire, quels boutons choisir et où saisir les réglages. Les noms des boutons peuvent varier un peu selon la langue ou les changements de l’interface des fournisseurs.

## Avant de commencer

Il faut avoir accès :

- au compte GitHub qui contient `AHOURMAROLAND/Bcommmunity` ;
- à une adresse e-mail accessible pour créer les comptes fournisseurs ;
- à une carte bancaire si le fournisseur demande une validation ou si vous choisissez un plan payant.

Les services cloud peuvent facturer l’hébergement, la base de données, le stockage ou les notifications. Consultez le prix et les limites du plan affichés avant de cliquer sur **Create**, **Deploy** ou **Upgrade**.

Créez les comptes avec les sites officiels ci-dessous et connectez-les si possible avec GitHub :

| Service | Site officiel | Utilisation |
| --- | --- | --- |
| GitHub | [github.com](https://github.com/) | Code source |
| Vercel | [vercel.com](https://vercel.com/) | Site web |
| Render | [render.com](https://render.com/) | API Django, Redis et tâches de fond |
| Neon | [neon.tech](https://neon.tech/) | Base PostgreSQL recommandée |
| Supabase | [supabase.com](https://supabase.com/) | Autre choix de base PostgreSQL, facultatif |
| Cloudflare | [cloudflare.com](https://www.cloudflare.com/) | Stockage d’images et fichiers R2 |
| OneSignal | [onesignal.com](https://onesignal.com/) | Notifications Web Push |

## Important : choisir une seule base de données

La capture fournie montre le tableau de bord **Supabase**. Le dépôt et le guide [DEPLOYMENT.md](./DEPLOYMENT.md) utilisent **Neon** par défaut. Les deux peuvent héberger PostgreSQL, mais il faut choisir un seul fournisseur et utiliser sa chaîne PostgreSQL dans Render.

**Conseil pour suivre ce guide sans modifier le projet : choisissez Neon.** Dans ce cas, vous n’avez pas besoin de créer un projet Supabase ni d’utiliser les boutons **API** de Supabase. L’application utilise la base PostgreSQL, pas l’API REST Supabase.

Si vous avez déjà créé un projet Supabase et souhaitez le garder, utilisez son URL de connexion PostgreSQL comme `DATABASE_URL` dans Render. Ne copiez pas les clés Supabase `anon` ou `service_role` dans le frontend : le backend actuel ne les utilise pas. Ne partagez jamais la clé `service_role`.

## 1. Créer la base de données Neon

1. Ouvrez [console.neon.tech](https://console.neon.tech/) et choisissez **Sign up** ou **Log in**.
2. Connectez-vous avec GitHub ou votre adresse e-mail.
3. Dans le tableau de bord, cliquez sur **Create project**.
4. Donnez un nom au projet, choisissez une région proche de **Frankfurt** (la région Render configurée), puis validez **Create project**.
5. Dans le projet, ouvrez **Dashboard** ou **Connect**.
6. Choisissez la base et le rôle proposés, puis copiez la **connection string** PostgreSQL. La chaîne ressemble à `postgresql://...`; gardez-la privée.
7. Si Neon propose plusieurs modes, copiez la chaîne **directe** pour `DATABASE_URL` lors du premier déploiement. Gardez `sslmode=require` dans l’URL si le fournisseur le propose.
8. Rangez cette URL dans un gestionnaire de mots de passe. Vous la collerez plus tard dans Render, pas dans le code ni dans Vercel.

Vous pouvez ignorer la section Supabase plus bas.

## 2. Créer et déployer le site Vercel

Le projet Vercel doit être créé avant de renseigner l’adresse frontend dans Render.

1. Ouvrez [vercel.com](https://vercel.com/) et cliquez sur **Sign Up**. Choisissez **Continue with GitHub**.
2. Autorisez Vercel à accéder au dépôt `AHOURMAROLAND/Bcommmunity`. Si GitHub demande quels dépôts partager, autorisez ce dépôt.
3. Dans Vercel, cliquez sur **Add New…** puis **Project** (ou **Import Project**).
4. Repérez `Bcommmunity` dans la liste GitHub et cliquez sur **Import**.
5. Dans la configuration du projet :
   - **Root Directory** : laissez `./` (la racine du dépôt) ;
   - **Framework Preset** : Vite si Vercel le détecte ; sinon laissez l’auto-détection ;
   - les commandes et le dossier de sortie sont déjà définis dans `vercel.json`.
6. Ouvrez **Environment Variables** avant le déploiement et ajoutez :

   | Name | Value |
   | --- | --- |
   | `VITE_WS_URL` | `wss://bakhita-api.onrender.com/ws/` |
   | `VITE_ONESIGNAL_APP_ID` | L’App ID OneSignal après l’étape OneSignal. Si OneSignal n’est pas encore configuré, laissez cette variable de côté et ajoutez-la plus tard. |
   | `VITE_GOOGLE_CLIENT_ID` | Facultatif : identifiant OAuth Web Google si la connexion Google est activée. |

   Dans **Environment**, cochez **Production**. N’ajoutez jamais de mot de passe, de clé REST ou de secret dans une variable commençant par `VITE_`.
7. Cliquez sur **Deploy** et attendez la fin du build.
8. Sur la page du projet, ouvrez **Settings** → **Domains** et notez le domaine Production, par exemple `bcommmunity.vercel.app`. Il faudra utiliser le domaine réellement affiché, pas cet exemple.
9. Si le déploiement affiche une erreur car l’API Render n’existe pas encore, le site peut être redéployé après l’étape Render. Vérifiez surtout que le build Vite se termine correctement.

## 3. Créer la base Supabase à la place de Neon (facultatif)

Ne suivez cette section que si vous choisissez Supabase plutôt que Neon.

1. Depuis le tableau de bord Supabase visible sur la capture, cliquez sur **New project** (ou **Nouveau projet**). Si vous êtes dans un projet déjà existant, utilisez le sélecteur de projets pour revenir au tableau de bord des projets.
2. Sélectionnez ou créez une organisation, puis saisissez le nom du projet et un mot de passe fort pour le rôle PostgreSQL.
3. Choisissez une région proche de Render, puis cliquez sur **Create new project**.
4. Attendez que le projet affiche l’état actif.
5. Cliquez sur **Connect** en haut de l’écran du projet, puis ouvrez **Connection string** et sélectionnez le format **URI**.
6. Choisissez une chaîne PostgreSQL adaptée à une application sur Render. La connexion directe est préférable si elle est accessible depuis votre plan et votre réseau. Si elle n’est pas accessible, utilisez le **Session pooler**, pas le **Transaction pooler** pour les migrations Render.
7. Remplacez le mot de passe de démonstration de la chaîne par le mot de passe PostgreSQL défini à la création du projet, puis conservez cette valeur comme secret. C’est cette URL complète qui sera mise dans `DATABASE_URL` sur Render.
8. Pour cette application, ne copiez pas les clés de la section **Project Settings** → **API** : elles ne remplacent pas `DATABASE_URL` et ne sont pas nécessaires au backend Django actuel.

Ne créez pas une seconde base Neon si vous choisissez Supabase. Une seule valeur de `DATABASE_URL` doit être utilisée par l’API et ses workers.

## 4. Créer le compte Render et lancer le Blueprint

1. Ouvrez [dashboard.render.com](https://dashboard.render.com/) et cliquez sur **Get Started** ou **Sign Up**.
2. Choisissez **GitHub** pour vous connecter, puis autorisez Render à lire le dépôt `AHOURMAROLAND/Bcommmunity`.
3. Dans le tableau de bord Render, cliquez sur **New +** → **Blueprint** (parfois nommé **Blueprint Instance**).
4. Choisissez le dépôt `Bcommmunity`, la branche `main`, puis cliquez sur **Connect** ou **Apply**.
5. Render lit le fichier `render.yaml`. Vérifiez la liste des services : `bakhita-api`, `bakhita-worker`, `bakhita-beat` et `bakhita-redis`.
6. Lorsque Render demande les valeurs des variables, remplissez celles-ci :

   | Variable Render | Valeur à saisir |
   | --- | --- |
   | `DATABASE_URL` | URL PostgreSQL Neon ou Supabase choisie précédemment |
   | `ALLOWED_HOSTS` | `bakhita-api.onrender.com,<domaine-production-vercel>` — noms d’hôte sans `https://` |
   | `CORS_ALLOWED_ORIGINS` | `https://<domaine-production-vercel>` |
   | `CSRF_TRUSTED_ORIGINS` | `https://<domaine-production-vercel>` |
   | `SITE_URL` | `https://<domaine-production-vercel>` |
   | `FRONTEND_URL` | `https://<domaine-production-vercel>` |
   | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_DOMAIN` | Valeurs Cloudflare de l’étape 5, ou laissez non configuré si le stockage R2 n’est pas encore utilisé |
   | `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY` | Valeurs OneSignal de l’étape 6, ou laissez non configuré si les notifications ne sont pas encore activées |
   | `BREVO_SMTP_LOGIN`, `BREVO_SMTP_PASSWORD` | Identifiants SMTP Brevo, si vous configurez les courriels |
   | `FCM_SERVICE_ACCOUNT_JSON` | JSON de service Firebase, uniquement si les notifications Android FCM sont utilisées |

   Render génère automatiquement `DJANGO_SECRET_KEY` et crée Redis. `TRUSTED_PROXY_IPS` est déjà prérempli dans le Blueprint.
7. Remplacez `<domaine-production-vercel>` par le domaine noté à l’étape Vercel, sans `/` final. Exemple de format : `bcommmunity.vercel.app`.
8. Vérifiez le coût des services puis cliquez sur **Apply**. Les plans `starter` sont payants.
9. Ouvrez **Events** ou **Logs** du service `bakhita-api` et attendez le statut **Live**. Render lance automatiquement les migrations pendant le déploiement.
10. Vérifiez dans un navigateur `https://bakhita-api.onrender.com/api/vivant/`. Si Render affiche un autre domaine pour le service, utilisez ce domaine réel et adaptez `vercel.json` ainsi que `VITE_WS_URL`.
11. Dans la page `bakhita-api`, ouvrez **Shell** et exécutez une fois :

   ```sh
   python manage.py charger_referentiels
   python manage.py createsuperuser
   ```

   Le second ordre demande le nom d’utilisateur et le mot de passe de l’administrateur. Ne les envoyez pas dans un message et ne les mettez pas dans Git.
12. Dans le menu **Environment** du service `bakhita-api`, vérifiez les domaines de Vercel, puis utilisez **Save, rebuild, and deploy** si vous modifiez une valeur.

> Si le Blueprint ne permet pas de laisser vide une intégration facultative, créez d’abord les valeurs Cloudflare/OneSignal correspondantes ou supprimez cette intégration du Blueprint avant de continuer. Ne saisissez pas de fausses clés.

## 5. Créer le stockage d’images Cloudflare R2 (facultatif)

1. Ouvrez [dash.cloudflare.com](https://dash.cloudflare.com/) et créez un compte ou connectez-vous.
2. Dans le tableau de bord, ouvrez **R2 Object Storage** (parfois dans **Storage & databases**).
3. Cliquez sur **Create bucket**, donnez un nom au bucket, choisissez une région si elle est proposée et validez.
4. Dans **R2** → **Manage R2 API Tokens**, cliquez sur **Create API token**.
5. Choisissez l’accès Object Read & Write et limitez le jeton au bucket de l’application. Cliquez sur **Create API Token**.
6. Copiez immédiatement l’Access Key ID et le Secret Access Key : le secret peut ne plus être affiché ensuite. Copiez aussi l’Account ID depuis le tableau de bord R2.
7. Dans le bucket, ouvrez **Settings** → **Public access** ou **Custom Domains**, puis associez un domaine personnalisé pour servir les images. Suivez l’écran Cloudflare jusqu’à ce que le domaine soit actif avec HTTPS.
8. Dans Render → service `bakhita-api` → **Environment**, renseignez les cinq variables `R2_*` listées à l’étape Render, puis cliquez sur **Save, rebuild, and deploy**.

`R2_PUBLIC_DOMAIN` est le nom d’hôte uniquement, sans `https://`. Ne rendez pas le bucket public avec un domaine `r2.dev` de test pour une production sensible ; préférez le domaine personnalisé et les règles d’accès adaptées.

## 6. Créer les notifications Web OneSignal (facultatif)

1. Ouvrez [dashboard.onesignal.com](https://dashboard.onesignal.com/) et créez un compte.
2. Cliquez sur **New App/Website** (ou **Add App**) et donnez un nom à l’application.
3. Choisissez **Web** / **Web Push** comme plateforme.
4. À l’étape de configuration du site, saisissez le domaine Vercel Production relevé plus haut. Choisissez l’intégration **Typical Site** ou l’option de configuration personnalisée, puis terminez l’assistant.
5. Dans les réglages de l’application OneSignal, copiez l’**App ID**. Il peut être exposé dans le frontend.
6. Ouvrez les réglages de clés / **Keys & IDs** et copiez la **REST API Key**. Cette clé est secrète.
7. Dans Vercel → projet → **Settings** → **Environment Variables**, ajoutez `VITE_ONESIGNAL_APP_ID` avec l’App ID, environnement **Production**, puis cliquez sur **Save**.
8. Dans Render → service `bakhita-api` → **Environment**, ajoutez `ONESIGNAL_APP_ID` avec le même App ID et `ONESIGNAL_REST_API_KEY` avec la clé REST. Cliquez sur **Save, rebuild, and deploy**.
9. Dans Vercel → **Deployments**, relancez **Redeploy** pour que la variable publique soit intégrée au site construit.
10. Ouvrez le site Vercel, connectez-vous, autorisez les notifications dans le navigateur et vérifiez l’abonnement depuis les paramètres de l’application.

Ne collez jamais la **REST API Key** dans Vercel sous un nom `VITE_*`, dans un fichier du dépôt ou dans une capture d’écran.

## 7. Vérifier le déploiement complet

1. Render : **bakhita-api** indique **Live** et `https://<hôte-api>/api/vivant/` répond.
2. Render : les services `bakhita-worker`, `bakhita-beat` et `bakhita-redis` sont actifs.
3. Vercel : le dernier déploiement du projet est **Ready** et son domaine de production ouvre l’application.
4. Depuis le site, créez un compte de test et vérifiez l’inscription, la connexion et les appels API.
5. Vérifiez les WebSockets : `VITE_WS_URL` doit être `wss://<hôte-api>/ws/`.
6. Si R2 est configuré, envoyez une image de test et contrôlez qu’elle s’affiche après rechargement.
7. Si OneSignal est configuré, autorisez les notifications puis envoyez un événement de test depuis l’application.
8. Si une origine Vercel ou une URL change, mettez à jour les variables d’origine dans Render. Si l’hôte Render change, mettez aussi à jour les destinations dans `vercel.json` et `VITE_WS_URL`, puis redéployez.

## Où garder les valeurs

- **Render → service web → Environment** : `DATABASE_URL`, secrets Django, domaines autorisés, clés R2, clés REST OneSignal, SMTP et FCM.
- **Vercel → projet → Settings → Environment Variables** : uniquement les valeurs publiques de build comme `VITE_ONESIGNAL_APP_ID`, `VITE_WS_URL` et `VITE_GOOGLE_CLIENT_ID`.
- **Neon/Supabase, Cloudflare, OneSignal et Firebase** : les mots de passe et clés privées restent dans les consoles ou le gestionnaire de mots de passe.

Ne mettez aucune vraie clé dans `.env.example`, `DEPLOYMENT.md`, ce guide, le chat ou Git.
