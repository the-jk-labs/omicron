#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Retention tests for the backup script. Runs inside the backup image against a
# throwaway local restic repository, with a stand-in pg_dump:
#   docker build -t omicron-backup ./backup
#   docker run --rm -v "$PWD/backup/tests:/tests:ro" --entrypoint sh omicron-backup /tests/retention.test.sh
set -eu

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/bin"
cat > "$work/bin/pg_dump" <<'EOF'
#!/bin/sh
for arg; do case "$arg" in --file=*) out="${arg#--file=}" ;; esac; done
date +%s%N > "$out"
EOF
chmod +x "$work/bin/pg_dump"
export PATH="$work/bin:$PATH"

export DATABASE_URL="postgres://stand-in"
export BACKUP_REPOSITORY="$work/repo"
export RESTIC_REPOSITORY="$work/repo"
printf 'test-password' > "$work/password"
export RESTIC_PASSWORD_FILE="$work/password"

failures=0
fail() { echo "FAIL: $*"; failures=$((failures + 1)); }
pass() { echo "ok: $*"; }

run() { /usr/local/bin/backup "$1" > "$work/last.log" 2>&1 || { cat "$work/last.log"; exit 1; }; }
count() { restic snapshots --json --tag "$1" | grep -o '"id"' | wc -l | tr -d ' '; }
ids() { restic snapshots --json --tag "$1" | grep -o '"short_id":"[0-9a-f]*"' | cut -d'"' -f4; }
# A repository with scheduled backups from the two previous days, as on any
# instance that has run for a while: restic also keeps the oldest snapshot
# while there are fewer days than --keep-daily asks for, which hides pruning.
fresh() {
  rm -rf "$work/repo"
  restic init > /dev/null
  mkdir -p /tmp/omicron-backup
  date > /tmp/omicron-backup/db.dump
  paths=/tmp/omicron-backup/db.dump
  for p in /data/uploads /data/state /run/secrets /etc/caddy/Caddyfile /data/cfg/botPolicy.yaml; do
    [ -e "$p" ] && paths="$paths $p"
  done
  for days in 2 1; do
    when="$(date -d "@$(($(date +%s) - days * 86400))" '+%Y-%m-%d %H:%M:%S')"
    # shellcheck disable=SC2086
    restic backup --quiet --host omicron --tag scheduled --time "$when" $paths > /dev/null
  done
}

# A startup backup (an upgraded stack booting) must not remove the backup taken
# just before the upgrade: that one is what a rollback restores.
fresh
run manual
before="$(ids manual)"
run boot
if [ "$(ids manual)" = "$before" ]; then pass "a boot backup keeps the earlier manual one"; else fail "a boot backup removed the manual backup $before"; fi

# Same for the daily schedule.
fresh
run manual
run scheduled
if [ "$(count manual)" = 1 ]; then pass "a scheduled backup keeps the earlier manual one"; else fail "a scheduled backup removed the manual backup"; fi

# Manual backups are kept by count, newest first.
fresh
export BACKUP_KEEP_MANUAL=2
run manual
oldest="$(ids manual)"
run manual
run manual
if [ "$(count manual)" = 2 ] && ! ids manual | grep -qx "$oldest"; then
  pass "BACKUP_KEEP_MANUAL=2 keeps the two newest manual backups"
else
  fail "expected the two newest of three manual backups, have $(count manual)"
fi
unset BACKUP_KEEP_MANUAL

# Automatic backups keep their daily rule: one per day.
fresh
run boot
run boot
run scheduled
# Two seeded days plus one for today.
if [ "$(($(count boot) + $(count scheduled)))" = 3 ]; then
  pass "automatic backups keep one per day"
else
  fail "expected one automatic backup per day (3), have $(($(count boot) + $(count scheduled)))"
fi

# 0 keeps every manual backup.
fresh
export BACKUP_KEEP_MANUAL=0
run manual
run manual
run manual
if [ "$(count manual)" = 3 ]; then pass "BACKUP_KEEP_MANUAL=0 keeps every manual backup"; else fail "BACKUP_KEEP_MANUAL=0 kept $(count manual) of 3"; fi
unset BACKUP_KEEP_MANUAL

# With every automatic rule at 0 nothing automatic is removed, and the run still succeeds.
fresh
export BACKUP_KEEP_DAILY=0 BACKUP_KEEP_WEEKLY=0 BACKUP_KEEP_MONTHLY=0
run boot
run boot
if [ "$(count boot)" = 2 ] && [ "$(count scheduled)" = 2 ]; then pass "all automatic rules at 0 remove nothing"; else fail "all automatic rules at 0 removed snapshots"; fi
unset BACKUP_KEEP_DAILY BACKUP_KEEP_WEEKLY BACKUP_KEEP_MONTHLY

# ── BACKUP_MAINTENANCE_DAYS ──
export BACKUP_MAINTENANCE_STAMP="$work/last-maintenance"
maintained() { grep -q "checking repository" "$work/last.log"; }

# The default prunes and checks after every run, as before.
fresh
rm -f "$BACKUP_MAINTENANCE_STAMP"
run boot
maintained && first=yes || first=no
run boot
if [ "$first" = yes ] && maintained; then pass "by default every run prunes and checks"; else fail "the default skipped prune or check"; fi

# With an interval, the first run maintains and the next ones within it don't,
# while retention still applies on every run.
fresh
rm -f "$BACKUP_MAINTENANCE_STAMP"
export BACKUP_MAINTENANCE_DAYS=7 BACKUP_KEEP_MANUAL=1
run manual
maintained && first=yes || first=no
run manual
if [ "$first" = yes ] && ! maintained && grep -q "skipped" "$work/last.log"; then
  pass "BACKUP_MAINTENANCE_DAYS=7 maintains once, then skips within the interval"
else
  fail "BACKUP_MAINTENANCE_DAYS=7 did not maintain once and then skip"
fi
if [ "$(count manual)" = 1 ]; then pass "retention still applies on a run that skips maintenance"; else fail "a skipped run kept $(count manual) manual backups, want 1"; fi

# Once the interval has passed it maintains again.
printf '%s\n%s\n' "$(($(date +%s) - 8 * 86400))" "$RESTIC_REPOSITORY" > "$BACKUP_MAINTENANCE_STAMP"
run manual
if maintained; then pass "maintenance runs again once the interval has passed"; else fail "maintenance did not run after the interval"; fi

# A stamp for another repository doesn't count for this one.
printf '%s\n%s\n' "$(date +%s)" "s3:elsewhere/bucket" > "$BACKUP_MAINTENANCE_STAMP"
run manual
if maintained; then pass "a new repository is maintained at once"; else fail "a stamp for another repository skipped maintenance"; fi

# A failed check fails the run and leaves no stamp, so the next run tries again.
fresh
rm -f "$BACKUP_MAINTENANCE_STAMP"
mkdir -p "$work/failing"
printf '#!/bin/sh\n[ "$1" = check ] && exit 1\nexec "$REAL_RESTIC" "$@"\n' > "$work/failing/restic"
chmod +x "$work/failing/restic"
status=0
REAL_RESTIC="$(command -v restic)" PATH="$work/failing:$PATH" /usr/local/bin/backup manual > "$work/last.log" 2>&1 || status=$?
if [ "$status" != 0 ] && [ ! -e "$BACKUP_MAINTENANCE_STAMP" ]; then
  pass "a failed check fails the run and is retried next time"
else
  fail "a failed check (status $status) left a stamp or passed"
fi
unset BACKUP_MAINTENANCE_DAYS BACKUP_KEEP_MANUAL BACKUP_MAINTENANCE_STAMP

if [ "$failures" != 0 ]; then
  echo "$failures retention test(s) failed"
  exit 1
fi
echo "all retention tests passed"
