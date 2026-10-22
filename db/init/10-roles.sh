#!/bin/sh
# First start of the Compose db service only (docker-entrypoint-initdb.d): create the DemandAI roles.
# Passwords must be URL-safe (letters, digits, - and _), because they also go into connection URLs;
# a stray @ or / in a password once broke another service's backups. Generate with: openssl rand -hex 32
set -eu
for v in DEMANDAI_OWNER_PASSWORD DEMANDAI_APP_PASSWORD DEMANDAI_OPS_PASSWORD; do
  eval "pw=\${$v:-}"
  if ! printf '%s' "$pw" | grep -Eq '^[A-Za-z0-9_-]{24,}$'; then
    echo "10-roles.sh: $v must be at least 24 characters of letters, digits, - or _" >&2
    exit 1
  fi
done
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v owner_pw="$DEMANDAI_OWNER_PASSWORD" -v app_pw="$DEMANDAI_APP_PASSWORD" -v ops_pw="$DEMANDAI_OPS_PASSWORD" \
  -v dbname="$POSTGRES_DB" -f /opt/demandai/bootstrap-roles.sql
