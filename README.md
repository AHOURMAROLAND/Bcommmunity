# Bakhita Community

Reseau social des eleves et anciens eleves du complexe scolaire Bakhita (maternelle, primaire, college, lycee moderne et lycee technique).

L'application permet aux lyceens actuels et aux anciens eleves de :
- Retrouver leurs camarades de classe grace a l'historique de leur parcours scolaire.
- Suivre les parcours professionnels et universitaires des anciens eleves.
- Publier des articles et actualites visibles par la communaute avec partage Open Graph.
- Echanger par messagerie instantanee apres acceptation d'une invitation de discussion.
- Garantir un environnement securise avec validation administrative des comptes et moderation via le Django admin.

---

## 1. Architecture technique

- **Backend** : Django 5.2, Django REST Framework, SimpleJWT (access token en memoire, refresh token en cookie HttpOnly / SameSite / Secure avec rotation et liste noire), Argon2 pour le hachage des mots de passe.
- **Base de donnees et cache** : PostgreSQL 16, Redis 7 (mise en cache des referentiels et du controle d'acces en 15 secondes).
- **Frontend Web et PWA** : React 19, Vite, Tailwind CSS, TanStack Query, React Router, typographie Quicksand en local (@fontsource/quicksand).
- **Mobile** : PWA installable et packaging APK Android via Capacitor.
- **Orchestration et CI/CD** : Docker Compose, GitHub Actions avec PostgreSQL et Redis sous forme de services, linters (Ruff, Oxlint), tests automatises et fermeture automatique des issues et jalons.

---

## 2. Structure du projet

```text
.
├── .github/
│   └── workflows/
│       └── ci.yml               # Pipeline CI (lint, tests, build, fermeture issues)
├── backend/
│   ├── config/                  # Configuration Django (settings, urls, wsgi, asgi)
│   ├── comptes/                 # Utilisateurs, suspensions, JWT, authentification
│   ├── profils/                 # Profil, situation actuelle (emploi, etudes), domaines
│   ├── scolarite/               # Cycles, classes, parcours scolaire
│   ├── Dockerfile
│   ├── pyproject.toml           # Configuration Ruff
│   ├── pytest.ini               # Configuration Pytest
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/                 # Client fetch, gestion JWT, erreurs, hooks TanStack Query
│   │   ├── auth/                # AuthContext et fournisseur de session
│   │   ├── components/          # Composants UI partages
│   │   ├── pages/               # Connexion, Inscription, EnAttente, Onboarding
│   │   ├── theme.css            # Variables de design et typographie Quicksand
│   │   └── App.jsx              # Routage et guards d'authentification
│   ├── package.json
│   └── vite.config.js
├── docs/                        # Specifications detaillees du projet
│   ├── 01_cahier_des_charges.md
│   ├── 02_user_stories.md
│   ├── 03_parcours_utilisateur_complet.md
│   └── 04_plan_de_realisation_et_annexes.md
├── scripts/
│   └── creer_issues_github.sh   # Creation automatique des labels, jalons et issues GitHub
└── docker-compose.yml
```

---

## 3. Demarrage local avec Docker Compose

### Prerequis
- Docker et Docker Compose installes.

### Etapes

1. Cloner le depot :
```bash
git clone https://github.com/AHOURMAROLAND/Bcommmunity.git
cd Bcommmunity
```

2. Configurer les variables d'environnement locales :
```bash
cp .env.example .env
```
Remplacez `DJANGO_SECRET_KEY` et `DB_PASSWORD`. Le mot de passe PostgreSQL Docker doit rester alphanumerique car il est aussi inclus dans `DATABASE_URL`. Pour activer le bouton de connexion Google, renseignez `VITE_GOOGLE_CLIENT_ID` avec l'identifiant client OAuth de type Web de Google Cloud Console (et le meme identifiant web dans `GOOGLE_CLIENT_IDS`). Cet identifiant client est public; ne mettez jamais le secret client dans le frontend.

3. Construire et demarrer la pile locale :
```bash
docker compose up -d --build
```
L'interface est disponible sur `http://localhost:8080`. Nginx sert le frontend et les fichiers statiques/media, puis relaie `/api/`, `/ws/`, `/p/` et l'URL d'administration vers Daphne. PostgreSQL, Redis, Celery worker et Celery Beat sont demarres avec des controles de disponibilite. Les migrations et `collectstatic` sont executes au demarrage de l'API.

Si la construction echoue avec `npm error ECONNRESET` pendant `npm ci`, c'est une interruption d'acces au registre npm depuis Docker. Relancez les constructions en plusieurs etapes pour isoler le telechargement frontend et limiter la pression reseau/memoire :
```powershell
docker compose build web
docker compose build api worker beat
docker compose up -d
docker compose ps
```
Le cache npm BuildKit est conserve entre les essais. Si `ECONNRESET` persiste, verifiez la connexion/proxy configure dans Docker Desktop, puis relancez `docker compose build web`; les commandes `exec` ne fonctionneront qu'apres que le service `api` soit demarre.

Cette configuration est destinee au developpement local : `SECURE_SSL_REDIRECT` est desactive et le port HTTP 8080 n'est pas chiffre. Ne l'exposez pas directement sur Internet. Pour une mise en production publique, configurez TLS et des secrets robustes dans un environnement gere hors du depot.

4. Charger les referentiels de base et creer un compte administrateur :
```bash
docker compose exec api python manage.py charger_referentiels
docker compose exec api python manage.py createsuperuser
```
Le Django admin est accessible sous la valeur `ADMIN_URL` definie dans `.env`.

5. Lancer les tests unitaires backend dans le conteneur :
```bash
docker compose exec api pytest -q
```

### Recuperer l'historique SQLite local

Le lancement Docker cree une base PostgreSQL distincte de `backend/db.sqlite3`. Les anciennes conversations et publications SQLite ne sont donc pas copiees automatiquement. Sur Windows, depuis la racine du depot, la procedure suivante exporte les donnees SQLite et les importe dans une base Compose vide. Elle ne remplace pas une procedure de fusion si PostgreSQL contient deja des comptes. Arretez d'abord le serveur de developpement local afin que la sauvegarde SQLite soit coherente.

1. Sauvegarder la base SQLite, puis exporter les donnees. La commande utilise l'environnement `.venv` du backend :
```powershell
Copy-Item .\backend\db.sqlite3 .\backend\db.sqlite3.backup
$env:DATABASE_URL = "sqlite:///$((Resolve-Path .\backend\db.sqlite3).Path -replace '\\','/')"
$env:DJANGO_DEBUG = "1"
& .\backend\.venv\Scripts\python.exe .\backend\manage.py dumpdata --natural-foreign --natural-primary --exclude contenttypes --exclude auth.permission --exclude admin.logentry --exclude sessions.session --exclude token_blacklist --indent 2 --output .\migration-bakhita.json
Remove-Item Env:DATABASE_URL
Remove-Item Env:DJANGO_DEBUG
```

2. Demarrer Compose et verifier que PostgreSQL n'a pas encore de comptes. N'importez pas le fixture si cette commande affiche un nombre superieur a `0` :
```powershell
docker compose up -d --build
docker compose exec api python manage.py shell -c "from comptes.models import User; print(User.objects.count())"
```

3. Importer le fixture, puis copier les fichiers media existants dans le volume partage :
```powershell
docker compose cp .\migration-bakhita.json api:/tmp/migration-bakhita.json
docker compose exec api python manage.py loaddata /tmp/migration-bakhita.json
docker compose cp .\backend\media api:/tmp/
docker compose exec api sh -c "cp -a /tmp/media/. /app/media/"
```

Le fichier `migration-bakhita.json` contient des donnees personnelles : gardez-le localement et supprimez-le apres avoir confirme l'import. Ne lancez pas `docker compose down -v` : cette commande supprimerait les volumes PostgreSQL et media.

Pour consulter les journaux ou arreter les services :
```bash
docker compose logs -f api web worker beat
docker compose down
```

---

## 4. Demarrage en developpement local (sans Docker)

### Backend

1. Creer et activer un environnement virtuel Python 3.11 ou 3.12 :
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Sur Windows : .venv\Scripts\activate
```

2. Installer les dependances :
```bash
pip install -r requirements.txt
```

3. Executer les migrations et lancer le serveur :
```bash
python manage.py migrate
python manage.py charger_referentiels
python manage.py runserver 0.0.0.0:8000
```

4. Linter et tests :
```bash
ruff check .
pytest -q
```

### Frontend

1. Installer les dependances Node (Node.js 20+ recommande) :
```bash
cd frontend
npm install
```

2. Demarrer le serveur de developpement Vite :
```bash
npm run dev
```
L'interface est accessible par defaut a l'adresse `http://localhost:5173`. Le proxy redirige automatiquement les requetes `/api` vers le backend sur `http://localhost:8000`.

3. Linter et verifier le build de production :
```bash
npm run lint
npm run build
```

---

## 5. Administration

L'interface d'administration Django est accessible sur l'URL definie par la variable d'environnement `ADMIN_URL` (par defaut `gestion-bakhita-x7/` ou `admin/`).

Fonctionnalites administratives implementees :
- Validation des comptes utilisateurs en attente avant leur premiere connexion.
- Actions de moderation en un clic : suspension 24 h, 7 jours, 30 jours, ou bannissement definitif.
- Levee manuelle ou automatique des suspensions.
- Gestion des referentiels de l'ecole : cycles, classes, filieres et domaines professionnels ou d'etudes.

---

## 6. Processus de developpement et CI/CD

- **Branches et Pull Requests** : la branche `main` est protegee. Les fusions se font par Pull Request apres validation des tests backend (Ruff + migrations + Pytest) et frontend (Linter + build Vite).
- **Fermeture automatique des issues** : un message de commit mentionnant `closes M1-XX` ferme automatiquement l'issue correspondante sur GitHub des lors que la CI est verte sur la branche `main`.
- **Fermeture automatique des jalons** : des qu'un jalon ne contient plus aucune issue ouverte, le workflow GitHub Actions ferme automatiquement le jalon.

Pour initialiser l'ensemble des labels, jalons (M1 a M8) et issues sur votre depot GitHub :
```bash
bash scripts/creer_issues_github.sh AHOURMAROLAND/Bcommmunity
```

---

## 7. Documentation du projet

Toute la documentation fonctionnelle, les parcours utilisateurs et les annexes techniques sont disponibles dans le dossier `docs/` :
- [01. Cahier des charges](docs/01_cahier_des_charges.md)
- [02. User Stories](docs/02_user_stories.md)
- [03. Parcours utilisateur complet](docs/03_parcours_utilisateur_complet.md)
- [04. Plan de realisation et annexes](docs/04_plan_de_realisation_et_annexes.md)
