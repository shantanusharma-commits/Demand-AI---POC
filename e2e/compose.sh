#!/usr/bin/env bash
# The end-to-end tests against the Compose stack that ships (plan §9 gates 7 and 11): db -> backup -> migrate -> app
# from an image, configured by environment variables only. CI's e2e job runs it; it also runs locally, as its own
# Compose project (demandai-e2e), so it never touches the development containers.
#
#   DEMANDAI_IMAGE=demandai-app:e2e e2e/compose.sh up     # env file with fresh secrets, stack up, ready, platform admin
#   E2E_BASE_URL=http://127.0.0.1:3100 E2E_PLATFORM_LINK="$(cat e2e/.state/platform-link)" npx playwright test
#   e2e/compose.sh down                                   # stack, volumes and env file removed
set -euo pipefail
cd "$(dirname "$0")/.."
project=demandai-e2e
envfile=.env.e2e
port=${E2E_COMPOSE_PORT:-3100}
image=${DEMANDAI_IMAGE:-demandai-app:e2e}
dc() { docker compose -p "$project" --env-file "$envfile" "$@"; }
secret() { openssl rand -hex 24; }

case "${1:-}" in
  up)
    umask 077
    cat > "$envfile" <<EOF
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$(secret)
POSTGRES_DB=demandai
DEMANDAI_OWNER_PASSWORD=$(secret)
DEMANDAI_APP_PASSWORD=$(secret)
DEMANDAI_OPS_PASSWORD=$(secret)
SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')
APP_BASE_URL=http://127.0.0.1:${port}
APP_PORT=${port}
DEMANDAI_IMAGE=${image}
NOTIFICATION_DISABLED=1
LOG_LEVEL=warn
EOF
    dc up -d --no-build
    for _ in $(seq 1 90); do
      curl -fsS "http://127.0.0.1:${port}/api/ready" > /dev/null 2>&1 && break
      sleep 2
    done
    # The container smoke test: ready (database reachable, migrations at the expected version) from env vars alone.
    echo "ready: $(curl -fsS "http://127.0.0.1:${port}/api/ready")"
    echo "health: $(curl -fsS "http://127.0.0.1:${port}/api/health")"
    if docker run --rm --entrypoint sh "$image" -c 'ls -A /app | grep -q "^\.env"'; then
      echo "the image holds an .env file" >&2
      exit 1
    fi
    # What an operator does on a new deployment: the first platform administrator, from the image's own command.
    mkdir -p e2e/.state
    dc run --rm -e APP_BASE_URL="http://127.0.0.1:${port}" migrate node scripts/users/create-admin.mjs --platform \
      --email platform.e2e@demandai.test --name "Pat Platform" | grep -o 'http[^ ]*/accept-invite#token=[^ ]*' > e2e/.state/platform-link
    echo "platform administrator invited"
    ;;
  logs)
    dc logs --no-color
    ;;
  down)
    dc down -v --remove-orphans
    rm -f "$envfile" e2e/.state/platform-link
    ;;
  *)
    echo "usage: e2e/compose.sh up|logs|down" >&2
    exit 2
    ;;
esac
