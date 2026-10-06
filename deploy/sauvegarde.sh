#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="${BAKHITA_ROOT:-/opt/bakhita}"
ENV_FILE="${BAKHITA_ENV_FILE:-$ROOT_DIR/.env.backup}"
if [[ ! -r "$ENV_FILE" ]]; then
  echo "Fichier d'environnement introuvable ou illisible: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${DIRECT_DATABASE_URL:?DIRECT_DATABASE_URL is required}"
: "${BK_AGE_RECIPIENT:?BK_AGE_RECIPIENT is required}"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is required}"
: "${R2_BACKUP_ACCESS_KEY_ID:?R2_BACKUP_ACCESS_KEY_ID is required}"
: "${R2_BACKUP_SECRET_ACCESS_KEY:?R2_BACKUP_SECRET_ACCESS_KEY is required}"
: "${R2_BUCKET_SAUVEGARDES:?R2_BUCKET_SAUVEGARDES is required}"
: "${PGDUMP_IMAGE:?Set PGDUMP_IMAGE to match the production PostgreSQL major version}"

command -v age >/dev/null || { echo "Installez age sur le serveur." >&2; exit 1; }
command -v docker >/dev/null || { echo "Docker est requis pour pg_dump et l'envoi R2." >&2; exit 1; }
if [[ -n "${HC_URL:-}" ]]; then
  command -v curl >/dev/null || { echo "curl est requis pour notifier le controleur de sauvegarde." >&2; exit 1; }
fi

umask 077
fichier="bakhita-$(date -u +%Y%m%dT%H%M%SZ).sql.gz.age"
temporaire="$(mktemp "${TMPDIR:-/tmp}/bakhita-backup.XXXXXX")"
trap 'rm -f "$temporaire"' EXIT

docker run --rm -e DIRECT_DATABASE_URL "$PGDUMP_IMAGE" \
  sh -ec 'pg_dump --dbname="$DIRECT_DATABASE_URL" --no-owner --no-privileges' \
  | gzip -9 \
  | age --recipient "$BK_AGE_RECIPIENT" --output "$temporaire"

docker run --rm \
  -e AWS_ACCESS_KEY_ID="$R2_BACKUP_ACCESS_KEY_ID" \
  -e AWS_SECRET_ACCESS_KEY="$R2_BACKUP_SECRET_ACCESS_KEY" \
  -e AWS_DEFAULT_REGION=auto \
  -v "$(dirname "$temporaire"):/backup:ro" \
  amazon/aws-cli:2 \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  s3 cp "/backup/$(basename "$temporaire")" \
  "s3://${R2_BUCKET_SAUVEGARDES}/${fichier}"

if [[ -n "${HC_URL:-}" ]]; then
  curl --fail --silent --show-error --max-time 10 "$HC_URL" >/dev/null
fi

printf 'Sauvegarde chiffrée envoyée: %s\n' "$fichier"
