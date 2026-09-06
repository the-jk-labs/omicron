#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Shared Postgres connection resolution for the backup sidecar. Mirrors the
# backend's resolveDatabaseUrl(): an explicit DATABASE_URL wins, otherwise the
# libpq variables are set from POSTGRES_* parts with the password read from
# POSTGRES_PASSWORD_FILE (Docker secret) or POSTGRES_PASSWORD.
#
# Provides: DATABASE_URL (when explicit) or PGHOST/PGPORT/PGUSER/PGDATABASE/
# PGPASSWORD. pg_dump/pg_restore/psql honour both. Source, don't execute.

# Cron jobs don't inherit the container environment, so re-import the snapshot
# the entrypoint saved at boot when it exists.
if [ -f /etc/backup/env.sh ]; then
  # shellcheck disable=SC1091
  . /etc/backup/env.sh
fi

if [ -n "${DATABASE_URL:-}" ]; then
  export DATABASE_URL
  return 0 2>/dev/null || exit 0
fi

_backup_password() {
  if [ -n "${POSTGRES_PASSWORD_FILE:-}" ] && [ -s "$POSTGRES_PASSWORD_FILE" ]; then
    tr -d '\r\n' < "$POSTGRES_PASSWORD_FILE"
  elif [ -n "${POSTGRES_PASSWORD:-}" ]; then
    printf '%s' "$POSTGRES_PASSWORD"
  fi
}

PGPASSWORD="$(_backup_password)"
if [ -z "$PGPASSWORD" ]; then
  echo "backup: no database password (set DATABASE_URL or POSTGRES_PASSWORD_FILE/POSTGRES_PASSWORD)" >&2
  return 1 2>/dev/null || exit 1
fi

export PGPASSWORD
export PGHOST="${POSTGRES_HOST:-postgres}"
export PGPORT="${POSTGRES_PORT:-5432}"
export PGUSER="${POSTGRES_USER:-omicron}"
export PGDATABASE="${POSTGRES_DB:-omicron}"
