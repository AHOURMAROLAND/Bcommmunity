#!/usr/bin/env python3
"""
Script de synchronisation pour fermer sur GitHub les issues
des jalons déjà intégralement réalisés (M1, M2, M3).
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

REPO_DEFAUT = "AHOURMAROLAND/Bcommmunity"

# Codes des issues déjà réalisées et testées dans le code
CODES_REALISES = {
    # Jalon M1
    "M1-01", "M1-02", "M1-03", "M1-04", "M1-05", "M1-06", "M1-07",
    "M1-08", "M1-09", "M1-10", "M1-11", "M1-12", "M1-13", "M1-14",
    "M1-15", "M1-16", "M1-17",
    # Jalon M2
    "M2-01", "M2-02", "M2-03", "M2-04", "M2-05",
    # Jalon M3
    "M3-01", "M3-02", "M3-03", "M3-04", "M3-05", "M3-06",
}

JALONS_TERMINES = {"M1 Fondations", "M2 Reseau", "M3 Publications"}


def requete_api(url, token, data=None, method="GET"):
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "Sync-Issues-Script")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    corps = json.dumps(data).encode("utf-8") if data is not None else None
    if corps:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data=corps) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8")
        print(f"Erreur API ({e.code}) : {err}", file=sys.stderr)
        return None


def main():
    parser = argparse.ArgumentParser(description="Fermer les issues déjà réalisées")
    parser.add_argument("--repo", default=REPO_DEFAUT)
    parser.add_argument("--token", default=os.environ.get("GITHUB_TOKEN"))
    args = parser.parse_args()

    token = args.token
    if not token:
        print("Erreur : token GitHub manquant.", file=sys.stderr)
        sys.exit(1)

    base_url = f"https://api.github.com/repos/{args.repo}"

    print(f"Récupération des issues ouvertes pour {args.repo}...")
    issues = requete_api(f"{base_url}/issues?state=open&per_page=100", token) or []

    fermees = 0
    for iss in issues:
        titre = iss.get("title", "")
        # Extraire le code [MX-XX]
        for code in CODES_REALISES:
            if titre.startswith(f"[{code}]"):
                num = iss["number"]
                print(f"-> Clôture de l'issue #{num} : {titre}")
                # Commentaire
                requete_api(
                    f"{base_url}/issues/{num}/comments",
                    token,
                    data={"body": "Validé et testé : code implémenté et vérifié."},
                    method="POST",
                )
                # Fermeture
                requete_api(
                    f"{base_url}/issues/{num}",
                    token,
                    data={"state": "closed", "state_reason": "completed"},
                    method="PATCH",
                )
                fermees += 1
                break

    print(f"\n{fermees} issue(s) fermée(s) avec succès.")

    # Clôture des milestones terminés si toutes leurs issues sont fermées
    print("\nVérification des jalons (milestones)...")
    milestones = requete_api(f"{base_url}/milestones?state=open", token) or []
    for m in milestones:
        if m["title"] in JALONS_TERMINES:
            # Récupérer les stats à jour du milestone
            m_detail = requete_api(f"{base_url}/milestones/{m['number']}", token)
            if m_detail and m_detail.get("open_issues", 0) == 0:
                print(f"-> Clôture du jalon : {m['title']}")
                requete_api(
                    f"{base_url}/milestones/{m['number']}",
                    token,
                    data={"state": "closed"},
                    method="PATCH",
                )


if __name__ == "__main__":
    main()
