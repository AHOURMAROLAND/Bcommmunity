#!/usr/bin/env python3
"""
Script de création des labels, jalons (milestones) et issues GitHub
utilisant directement l'API REST de GitHub (aucun binaire externe requis).

Utilisation :
  python scripts/creer_issues_github.py --token <VOTRE_TOKEN_GITHUB>
ou :
  $env:GITHUB_TOKEN="ghp_xxx"
  python scripts/creer_issues_github.py
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

REPO_DEFAUT = "AHOURMAROLAND/Bcommmunity"

LABELS = [
    {"name": "backend", "color": "1d76db", "description": "Backend Django et API REST"},
    {"name": "frontend", "color": "0e8a16", "description": "Frontend React et interface"},
    {"name": "admin", "color": "5319e7", "description": "Administration Django"},
    {"name": "infra", "color": "0052cc", "description": "Infrastructure et déploiement"},
    {"name": "mobile", "color": "fbca04", "description": "PWA et APK mobile"},
    {"name": "qualite", "color": "d93f0b", "description": "Tests et audits"},
]

JALONS = [
    "M1 Fondations",
    "M2 Reseau",
    "M3 Publications",
    "M4 Chat",
    "M5 Notifications",
    "M6 Signalement",
    "M7 Mobile",
    "M8 Recette",
]

ISSUES = [
    ("M1 Fondations", "M1-01", "Initialiser le dépôt, structure backend et frontend", "infra"),
    ("M1 Fondations", "M1-02", "Docker Compose (Django, PostgreSQL, Redis)", "infra"),
    ("M1 Fondations", "M1-03", "CI : lint, tests, fermeture automatique des issues", "infra"),
    ("M1 Fondations", "M1-04", "Réglages Django sécurisés par variables d'environnement", "backend"),
    ("M1 Fondations", "M1-05", "Modèles User et Suspension", "backend"),
    ("M1 Fondations", "M1-06", "Inscription avec validation par l'administrateur", "backend"),
    ("M1 Fondations", "M1-07", "Connexion JWT, refresh en cookie HttpOnly, déconnexion", "backend"),
    ("M1 Fondations", "M1-08", "Refus d'accès si compte non validé ou suspendu", "backend"),
    ("M1 Fondations", "M1-09", "Référentiels : cycles, classes, domaines", "backend"),
    ("M1 Fondations", "M1-10", "Profil et situation actuelle (API)", "backend"),
    ("M1 Fondations", "M1-11", "Parcours scolaire (CRUD et validations)", "backend"),
    ("M1 Fondations", "M1-12", "Django admin personnalisé (validation, suspension)", "admin"),
    ("M1 Fondations", "M1-13", "Client API, thèmes clair et sombre, police Quicksand", "frontend"),
    ("M1 Fondations", "M1-14", "Écrans inscription, connexion, attente de validation", "frontend"),
    ("M1 Fondations", "M1-15", "Onboarding : profil, parcours, situation", "frontend"),
    ("M1 Fondations", "M1-16", "Connexion et inscription avec Google", "backend"),
    ("M1 Fondations", "M1-17", "Mot de passe oublié (demande et réinitialisation)", "backend"),
    ("M2 Reseau", "M2-01", "Annuaire et filtres", "backend"),
    ("M2 Reseau", "M2-02", "Suggestions de camarades", "backend"),
    ("M2 Reseau", "M2-03", "Amitiés : demander, accepter, refuser, retirer", "backend"),
    ("M2 Reseau", "M2-04", "Blocage d'utilisateur", "backend"),
    ("M2 Reseau", "M2-05", "Écrans annuaire, profil d'un autre, amis", "frontend"),
    ("M3 Publications", "M3-01", "Modèles et API des publications", "backend"),
    ("M3 Publications", "M3-02", "Upload d'image sécurisé", "backend"),
    ("M3 Publications", "M3-03", "Likes et commentaires", "backend"),
    ("M3 Publications", "M3-04", "Fil paginé", "backend"),
    ("M3 Publications", "M3-05", "Page de partage /p/{id} avec Open Graph", "backend"),
    ("M3 Publications", "M3-06", "Écrans fil, création, publication, partage", "frontend"),
    ("M4 Chat", "M4-01", "Invitations de discussion (API)", "backend"),
    ("M4 Chat", "M4-02", "Consumer WebSocket authentifié par JWT", "backend"),
    ("M4 Chat", "M4-03", "Messages, écrit, lu, historique", "backend"),
    ("M4 Chat", "M4-04", "Écrans messages, invitations, conversation", "frontend"),
    ("M5 Notifications", "M5-01", "Notifications internes et temps réel", "backend"),
    ("M5 Notifications", "M5-02", "Notification de nouvelle publication (Celery)", "backend"),
    ("M5 Notifications", "M5-03", "Préférences de notification", "backend"),
    ("M5 Notifications", "M5-04", "Web Push et FCM", "backend"),
    ("M5 Notifications", "M5-05", "Écrans notifications et paramètres", "frontend"),
    ("M6 Signalement", "M6-01", "Signalement d'utilisateur et de publication", "backend"),
    ("M6 Signalement", "M6-02", "Actions admin : masquer, suspendre, bannir", "admin"),
    ("M6 Signalement", "M6-03", "Levée automatique des suspensions (Celery beat)", "backend"),
    ("M6 Signalement", "M6-04", "Modale Signaler et écran Compte suspendu", "frontend"),
    ("M7 Mobile", "M7-01", "PWA : manifeste, service worker, bandeau iPhone", "frontend"),
    ("M7 Mobile", "M7-02", "APK Android avec Capacitor", "mobile"),
    ("M7 Mobile", "M7-03", "Icônes et écran de démarrage", "mobile"),
    ("M8 Recette", "M8-01", "Tests de bout en bout", "qualite"),
    ("M8 Recette", "M8-02", "Audit de sécurité et de performance", "qualite"),
    ("M8 Recette", "M8-03", "Déploiement HTTPS et sauvegardes", "infra"),
    ("M8 Recette", "M8-04", "Pilote avec une classe", "qualite"),
]


def requete_api(url, token, data=None, method="GET"):
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "Bakhita-Community-Script")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    corps = json.dumps(data).encode("utf-8") if data is not None else None
    if corps:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data=corps) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        # Si la ressource existe déjà (422), on l'ignore proprement
        if e.code == 422:
            return None
        print(f"Erreur API ({e.code}) sur {url} : {err_msg}", file=sys.stderr)
        return None


def main():
    parser = argparse.ArgumentParser(description="Créer les jalons, labels et issues GitHub")
    parser.add_argument("--repo", default=REPO_DEFAUT, help=f"Dépôt cible (défaut : {REPO_DEFAUT})")
    parser.add_argument("--token", default=os.environ.get("GITHUB_TOKEN"), help="Token GitHub personnel (PAT)")
    args = parser.parse_args()

    token = args.token
    if not token:
        print("Erreur : aucun token GitHub fourni.", file=sys.stderr)
        print("Veuillez fournir un token soit via --token <VOTRE_TOKEN>, soit via la variable d'environnement GITHUB_TOKEN.", file=sys.stderr)
        print("Pour créer un token : https://github.com/settings/tokens (droits 'repo').", file=sys.stderr)
        sys.exit(1)

    repo = args.repo
    base_url = f"https://api.github.com/repos/{repo}"

    print(f"1. Configuration des labels pour {repo}...")
    for lbl in LABELS:
        requete_api(f"{base_url}/labels", token, data=lbl, method="POST")

    print("2. Configuration des jalons (milestones)...")
    jalons_map = {}
    # Récupérer les jalons existants
    existant = requete_api(f"{base_url}/milestones?state=all", token) or []
    for m in existant:
        jalons_map[m["title"]] = m["number"]

    for jalon in JALONS:
        if jalon not in jalons_map:
            res = requete_api(f"{base_url}/milestones", token, data={"title": jalon}, method="POST")
            if res and "number" in res:
                jalons_map[jalon] = res["number"]

    print("3. Récupération des issues existantes...")
    issues_existantes = set()
    page = 1
    while True:
        liste = requete_api(f"{base_url}/issues?state=all&per_page=100&page={page}", token) or []
        if not liste:
            break
        for iss in liste:
            issues_existantes.add(iss["title"])
        page += 1

    print(f"4. Création des issues ({len(ISSUES)} prévues)...")
    creees = 0
    for jalon, code, titre, label in ISSUES:
        titre_complet = f"[{code}] {titre}"
        if titre_complet in issues_existantes:
            continue

        milestone_num = jalons_map.get(jalon)
        payload = {
            "title": titre_complet,
            "body": f"Code {code}. Pour fermer automatiquement : écrire 'closes {code}' dans un message de commit sur main, une fois la CI verte.",
            "labels": [label],
        }
        if milestone_num:
            payload["milestone"] = milestone_num

        res = requete_api(f"{base_url}/issues", token, data=payload, method="POST")
        if res:
            creees += 1
            print(f"   + Issue créée : {titre_complet}")

    print(f"\nTerminé ! {creees} nouvelle(s) issue(s) créée(s).")


if __name__ == "__main__":
    main()
