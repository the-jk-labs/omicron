#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Restore this instance from a backup snapshot.
# Usage: ./backup/restore.sh [snapshot-id]   (default: latest)
#
# Restores the database, uploads and state, then restarts the backend.
# Secrets are deliberately NOT overwritten (a stale db_password would lock
# Postgres out): the script prints how to inspect them instead.
set -eu
cd "$(dirname "$0")/.."

SNAP="${1:-latest}"

echo "==> available snapshots:"
docker compose exec backup restic snapshots

echo "==> restoring snapshot '$SNAP' into the backup container's staging area…"
docker compose exec backup restic restore "$SNAP" --target /tmp/omicron-restore

echo "==> stopping backend (postgres stays up)…"
docker compose stop backend

echo "==> restoring database + uploads + state…"
docker compose exec backup restore-from /tmp/omicron-restore

echo "==> starting backend…"
docker compose start backend

cat <<EOF
==> done. Notes:
- Files created after the snapshot was taken are left in place; uploads that
  nothing references anymore are cleaned up by the daily upload GC.
- Secrets were NOT touched. If you need them (e.g. rebuilding on a new host):
    docker compose exec backup restic restore $SNAP --target /tmp/omicron-secrets
    docker cp "\$(docker compose ps -q backup):/tmp/omicron-secrets/run/secrets" ./restored-secrets
  then copy the files you need and remove the staging dir:
    docker compose exec backup rm -rf /tmp/omicron-secrets
EOF
