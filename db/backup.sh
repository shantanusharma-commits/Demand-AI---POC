#!/bin/sh
# One-shot backup before every start or deploy (Compose `backup` service, postgres image).
# The dump goes to a temporary file; pg_dump's own exit status, the file size and the archive's table of contents
# are all checked before it is kept. No pipes (a pipe once hid pg_dump failures elsewhere) and no connection URI
# (discrete arguments, password from the environment). Keeps the newest BACKUP_RETAIN dumps.
set -eu
: "${PGHOST:?}" "${POSTGRES_USER:?}" "${POSTGRES_PASSWORD:?}" "${POSTGRES_DB:?}"
retain="${BACKUP_RETAIN:-20}"
dir="${BACKUP_DIR:-/backups}"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
out="$dir/demandai-$stamp.dump"
tmp="$out.partial"
log() { printf '{"level":"%s","time":"%s","service":"demandai-backup","event":"%s","msg":"%s"}\n' "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$2" "$3"; }

export PGPASSWORD="$POSTGRES_PASSWORD"
if ! pg_dump --host "$PGHOST" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format custom --file "$tmp"; then
  rm -f "$tmp"; log error backup.failed "pg_dump exited non-zero"; exit 1
fi
size=$(stat -c %s "$tmp")
if [ "$size" -le 0 ]; then
  rm -f "$tmp"; log error backup.failed "dump file is empty"; exit 1
fi
if ! pg_restore --list "$tmp" > /dev/null; then
  rm -f "$tmp"; log error backup.failed "dump is not a readable archive"; exit 1
fi
mv "$tmp" "$out"
log info backup.done "$(basename "$out") $size bytes"

# Retention: newest first, delete the rest.
ls -1t "$dir"/demandai-*.dump 2>/dev/null | tail -n +"$((retain + 1))" | while read -r old; do rm -f "$old"; log info backup.pruned "$(basename "$old")"; done
