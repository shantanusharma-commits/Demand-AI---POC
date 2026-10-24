#!/usr/bin/env bash
# Writes the stack's env file on an EC2 host from two sources, before every start (demandai.service runs it):
#   /etc/demandai/settings.env  what is not secret (APP_BASE_URL, DEMANDAI_IMAGE, DEMANDAI_HOST, RDS_HOST, AI switches…)
#   AWS Secrets Manager         one secret, a JSON object of NAME: value (SESSION_SECRET, the DEMANDAI_*_PASSWORD role
#                               passwords, AZURE_OPENAI_API_KEY…), read with the instance profile's IAM role
# The result, /etc/demandai/demandai.env, is readable by root only and replaced in one step. Values are never printed.
# Needs the AWS CLI v2 and jq. Settings: DEMANDAI_SECRET_ID and AWS_REGION in /etc/demandai/sync.conf.
set -euo pipefail
secret_id=${DEMANDAI_SECRET_ID:?set DEMANDAI_SECRET_ID in /etc/demandai/sync.conf}
dir=${DEMANDAI_ETC:-/etc/demandai}
settings=$dir/settings.env
out=$dir/demandai.env

umask 077
tmp=$(mktemp "$dir/.demandai.env.XXXXXX")
trap 'rm -f "$tmp"' EXIT
{
  echo "# Written by sync-secrets.sh at $(date -u +%FT%TZ). Do not edit: change settings.env or the secret."
  grep -vE '^\s*(#|$)' "$settings"
  aws secretsmanager get-secret-value --secret-id "$secret_id" --query SecretString --output text \
    | jq -r 'to_entries[] | select(.key | test("^[A-Z][A-Z0-9_]*$")) | select((.value | tostring | test("\n")) | not) | "\(.key)=\(.value)"'
} > "$tmp"

# Compose refuses to start without these; say which is missing, never its value.
missing=0
for name in SESSION_SECRET DEMANDAI_OWNER_PASSWORD DEMANDAI_APP_PASSWORD DEMANDAI_OPS_PASSWORD APP_BASE_URL DEMANDAI_IMAGE POSTGRES_DB; do
  grep -qE "^${name}=.+" "$tmp" || { echo "sync-secrets: ${name} is not set" >&2; missing=1; }
done
# With RDS the local superuser isn't used, but Compose still reads its variables.
grep -qE '^RDS_HOST=.+' "$tmp" && ! grep -qE '^POSTGRES_PASSWORD=' "$tmp" && printf 'POSTGRES_USER=unused-with-rds\nPOSTGRES_PASSWORD=unused-with-rds\n' >> "$tmp"
[ "$missing" = 0 ] || exit 1

mv "$tmp" "$out"
trap - EXIT
echo "sync-secrets: wrote $out ($(grep -cE '^[A-Z]' "$out") settings)"
