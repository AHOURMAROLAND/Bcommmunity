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

## 3. Demarrage rapide avec Docker

### Prerequis
- Docker et Docker Compose installes.

### Etapes

1. Cloner le depot :
```bash
git clone https://github.com/AHOURMAROLAND/Bcommmunity.git
cd Bcommmunity
```

2. Configurer les variables d'environnement :
```bash
cp .env.example .env
```
Renseignez les variables requises dans `.env` (`DJANGO_SECRET_KEY`, `DB_PASSWORD`, etc.).

3. Demarrer les conteneurs :
```bash
docker compose up -d --build
```

4. Executer les migrations et charger les referentiels de base :
```bash
docker compose exec api python manage.py migrate
docker compose exec api python manage.py charger_referentiels
docker compose exec api python manage.py createsuperuser
```

5. Lancer les tests unitaires backend dans le conteneur :
```bash
docker compose exec api pytest -q
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
