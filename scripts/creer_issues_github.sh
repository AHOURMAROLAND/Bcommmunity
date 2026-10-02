#!/usr/bin/env bash
set -euo pipefail
REPO="${1:-AHOURMAROLAND/Bcommmunity}"

echo "Configuration pour le dépôt: $REPO"

for l in backend frontend admin infra mobile qualite; do
  gh label create "$l" -R "$REPO" --force >/dev/null 2>&1 || true
done

for m in "M1 Fondations" "M2 Reseau" "M3 Publications" "M4 Chat" "M5 Notifications" "M6 Signalement" "M7 Mobile" "M8 Recette"; do
  gh api "repos/$REPO/milestones" -f title="$m" >/dev/null 2>&1 || true
done

while IFS='|' read -r jalon code titre label; do
  [ -z "$code" ] && continue
  gh issue create -R "$REPO" --title "[$code] $titre" --milestone "$jalon" --label "$label" \
    --body "Code $code. Pour fermer automatiquement : écrire 'closes $code' dans un message de commit sur main, une fois la CI verte." >/dev/null
done <<'DATA'
M1 Fondations|M1-01|Initialiser le dépôt, structure backend et frontend|infra
M1 Fondations|M1-02|Docker Compose (Django, PostgreSQL, Redis)|infra
M1 Fondations|M1-03|CI : lint, tests, fermeture automatique des issues|infra
M1 Fondations|M1-04|Réglages Django sécurisés par variables d'environnement|backend
M1 Fondations|M1-05|Modèles User et Suspension|backend
M1 Fondations|M1-06|Inscription avec validation par l'administrateur|backend
M1 Fondations|M1-07|Connexion JWT, refresh en cookie HttpOnly, déconnexion|backend
M1 Fondations|M1-08|Refus d'accès si compte non validé ou suspendu|backend
M1 Fondations|M1-09|Référentiels : cycles, classes, domaines|backend
M1 Fondations|M1-10|Profil et situation actuelle (API)|backend
M1 Fondations|M1-11|Parcours scolaire (CRUD et validations)|backend
M1 Fondations|M1-12|Django admin personnalisé (validation, suspension)|admin
M1 Fondations|M1-13|Client API, thèmes clair et sombre, police Quicksand|frontend
M1 Fondations|M1-14|Écrans inscription, connexion, attente de validation|frontend
M1 Fondations|M1-15|Onboarding : profil, parcours, situation|frontend
M2 Reseau|M2-01|Annuaire et filtres|backend
M2 Reseau|M2-02|Suggestions de camarades|backend
M2 Reseau|M2-03|Amitiés : demander, accepter, refuser, retirer|backend
M2 Reseau|M2-04|Blocage d'utilisateur|backend
M2 Reseau|M2-05|Écrans annuaire, profil d'un autre, amis|frontend
M3 Publications|M3-01|Modèles et API des publications|backend
M3 Publications|M3-02|Upload d'image sécurisé|backend
M3 Publications|M3-03|Likes et commentaires|backend
M3 Publications|M3-04|Fil paginé|backend
M3 Publications|M3-05|Page de partage /p/{id} avec Open Graph|backend
M3 Publications|M3-06|Écrans fil, création, publication, partage|frontend
M4 Chat|M4-01|Invitations de discussion (API)|backend
M4 Chat|M4-02|Consumer WebSocket authentifié par JWT|backend
M4 Chat|M4-03|Messages, écrit, lu, historique|backend
M4 Chat|M4-04|Écrans messages, invitations, conversation|frontend
M5 Notifications|M5-01|Notifications internes et temps réel|backend
M5 Notifications|M5-02|Notification de nouvelle publication (Celery)|backend
M5 Notifications|M5-03|Préférences de notification|backend
M5 Notifications|M5-04|Web Push et FCM|backend
M5 Notifications|M5-05|Écrans notifications et paramètres|frontend
M6 Signalement|M6-01|Signalement d'utilisateur et de publication|backend
M6 Signalement|M6-02|Actions admin : masquer, suspendre, bannir|admin
M6 Signalement|M6-03|Levée automatique des suspensions (Celery beat)|backend
M6 Signalement|M6-04|Modale Signaler et écran Compte suspendu|frontend
M7 Mobile|M7-01|PWA : manifeste, service worker, bandeau iPhone|frontend
M7 Mobile|M7-02|APK Android avec Capacitor|mobile
M7 Mobile|M7-03|Icônes et écran de démarrage|mobile
M8 Recette|M8-01|Tests de bout en bout|qualite
M8 Recette|M8-02|Audit de sécurité et de performance|qualite
M8 Recette|M8-03|Déploiement HTTPS et sauvegardes|infra
M8 Recette|M8-04|Pilote avec une classe|qualite
DATA

echo "Jalons, labels et issues créés avec succès."
