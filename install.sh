#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Omicron installer and updater.
#
#   curl -fsSL https://raw.githubusercontent.com/the-jk-labs/omicron/main/install.sh | sh
#
# Install: pulls Omicron's prebuilt images, fetches the few files they run with
# (listed in deploy.files) into ./omicron, and starts the stack with Docker or
# Podman. Update: run it again (./install.sh inside the install directory). It
# backs up first, pulls the images of the chosen channel, and fetches the files
# at the exact commit those images were built from, so the two always match.
#
# Environment overrides:
#   OMICRON_VERSION   stable (default) | edge | an exact version such as 2.1.0.
#                     Saved to .env, so later runs keep the choice.
#   OMICRON_REGISTRY  where images come from (default: ghcr.io/the-jk-labs;
#                     the Docker Hub mirror is docker.io/<namespace>). Saved too.
#   OMICRON_DIR       install directory (default: ./omicron, or . inside one)
#   OMICRON_SKIP_BACKUP=1      update without the pre-update backup
#   OMICRON_ALLOW_DOWNGRADE=1  move to an older version (needs a restore after)
#   HTTP_PORT / HTTPS_PORT     host ports (default 80/443; e.g. 8080/8443 for rootless Podman)

set -eu

REPO_SLUG="the-jk-labs/omicron"
DEFAULT_REGISTRY="ghcr.io/the-jk-labs"
REVISION_LABEL="org.opencontainers.image.revision"

log() { printf '\033[1m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*" >&2; }
err() { printf '\033[31m✖ %s\033[0m\n' "$*" >&2; }
have() { command -v "$1" >/dev/null 2>&1; }

# Pick a container engine + compose command. Prefer Docker, fall back to Podman.
detect_compose() {
  if have docker && docker compose version >/dev/null 2>&1; then
    COMPOSE="docker compose"; ENGINE="docker"; return 0
  fi
  if have docker-compose; then
    COMPOSE="docker-compose"; ENGINE="docker"; return 0
  fi
  if have podman && podman compose version >/dev/null 2>&1; then
    COMPOSE="podman compose"; ENGINE="podman"; return 0
  fi
  if have podman-compose; then
    COMPOSE="podman-compose"; ENGINE="podman"; return 0
  fi
  return 1
}

fetch() { # url dest
  if have curl; then curl -fsSL "$1" -o "$2"; else wget -qO "$2" "$1"; fi
}

env_get() { # key → its value in .env (last one wins, quotes stripped), or nothing
  [ -f .env ] || return 0
  sed -n "s/^$1=//p" .env | tail -n 1 | sed "s/^[\"']//; s/[\"']\$//"
}

env_set() { # key value
  if [ -f .env ] && grep -q "^$1=" .env; then
    tmp="$(mktemp)"
    sed "s|^$1=.*|$1=$2|" .env > "$tmp"
    cat "$tmp" > .env # keeps the file's owner and mode
    rm -f "$tmp"
  else
    [ -f .env ] || printf '# This instance'"'"'s settings. Every option: .env.example\n' > .env
    printf '%s=%s\n' "$1" "$2" >> .env
  fi
}

label_of() { # image-or-container → its source commit, or nothing
  "$ENGINE" inspect --format "{{ index .Config.Labels \"$REVISION_LABEL\" }}" "$1" 2>/dev/null |
    grep -E '^[0-9a-f]{40}$' || true
}

if ! detect_compose; then
  err "No container engine found. Install Docker (with the Compose plugin) or Podman, then re-run."
  exit 1
fi
if ! have curl && ! have wget; then
  err "Need curl or wget to download Omicron."
  exit 1
fi
log "Using: $COMPOSE ($ENGINE)"

# Run from inside an install, it updates that one.
if [ -z "${OMICRON_DIR:-}" ]; then
  if [ -f docker-compose.yml ] && [ -f Caddyfile ]; then OMICRON_DIR=.; else OMICRON_DIR=omicron; fi
fi
mkdir -p "$OMICRON_DIR"
cd "$OMICRON_DIR"

existing=false
[ -f docker-compose.yml ] && existing=true
source_checkout=false
[ -d .git ] && have git && source_checkout=true

if [ -n "${OMICRON_REF:-}" ]; then
  warn "OMICRON_REF is no longer used; set OMICRON_VERSION (stable, edge or e.g. 2.1.0) instead."
fi

# ── Which version ──────────────────────────────────────────────────────────
version="${OMICRON_VERSION:-$(env_get OMICRON_VERSION)}"
if [ -z "$version" ]; then
  if $existing; then
    # Installs from before the channels followed main; stable could be older and
    # migrations can't go back, so they stay on edge until someone chooses.
    version=edge
    warn "No OMICRON_VERSION in .env: this install has been following main, so it stays on edge."
    warn "To move to stable later, once a release is newer than what you run: OMICRON_VERSION=stable ./install.sh"
  else
    version=stable
  fi
fi
version="${version#v}"
[ "$version" = latest ] && version=stable
case "$version" in
  stable | edge | [0-9]*.[0-9]*.[0-9]*) ;;
  *)
    err "OMICRON_VERSION must be stable, edge or an exact version such as 2.1.0 (got: $version)."
    exit 1
    ;;
esac
registry="${OMICRON_REGISTRY:-$(env_get OMICRON_REGISTRY)}"
registry="${registry:-$DEFAULT_REGISTRY}"

# ── Back up before touching an existing install ────────────────────────────
old_rev=""
if $existing; then
  if [ "${OMICRON_SKIP_BACKUP:-}" = 1 ]; then
    warn "Skipping the pre-update backup (OMICRON_SKIP_BACKUP=1)."
  else
    log "Backing up before the update…"
    if ! $COMPOSE exec -T backup backup-now; then
      err "The pre-update backup failed, so nothing was changed."
      err "Is the stack running? Start it with '$COMPOSE up -d' and re-run, or re-run with"
      err "OMICRON_SKIP_BACKUP=1 if you have another, recent backup."
      exit 1
    fi
  fi
  backend_container="$($COMPOSE ps -q backend 2>/dev/null | head -n 1 || true)"
  [ -n "$backend_container" ] && old_rev="$(label_of "$backend_container")"
  if [ -z "$old_rev" ] && $source_checkout; then old_rev="$(git rev-parse HEAD)"; fi
fi

# ── Images first: their label names the commit the files must come from ─────
log "Pulling Omicron $version from $registry…"
"$ENGINE" pull "$registry/omicron-backend:$version"
rev="$(label_of "$registry/omicron-backend:$version")"
if [ -z "$rev" ]; then
  err "The image $registry/omicron-backend:$version doesn't say which commit it was built from."
  exit 1
fi

# Migrations only go forward: an older backend can't read a newer database.
if [ -n "$old_rev" ] && [ "$old_rev" != "$rev" ]; then
  compare="$(mktemp)"
  if fetch "https://api.github.com/repos/$REPO_SLUG/compare/$rev...$old_rev?per_page=1" "$compare" 2>/dev/null; then
    # ahead_by: commits the running version has that the new one lacks.
    ahead="$(grep -o '"ahead_by": *[0-9]*' "$compare" | head -n 1 | grep -o '[0-9]*$' || true)"
    if [ "${ahead:-0}" -gt 0 ]; then
      if [ "${OMICRON_ALLOW_DOWNGRADE:-}" = 1 ]; then
        warn "Moving to an older version ($version). Restore a backup from before the newer one ran."
      else
        rm -f "$compare"
        err "$version is older than what this instance runs ($(printf '%s' "$old_rev" | cut -c1-7)), and"
        err "migrations only go forward, so it may not read your database. Nothing was changed."
        err "Wait for a newer $version, or set OMICRON_ALLOW_DOWNGRADE=1 and restore a backup after."
        exit 1
      fi
    fi
  else
    warn "Couldn't ask GitHub whether $version is older than what runs now; continuing."
  fi
  rm -f "$compare"
fi

# ── The files those images run with ────────────────────────────────────────
short_rev="$(printf '%s' "$rev" | cut -c1-7)"
if $source_checkout; then
  log "Checking out $short_rev in this source checkout…"
  if [ "$(git rev-parse --is-shallow-repository)" = true ]; then
    git fetch --quiet --depth 1 origin "$rev"
  else
    git fetch --quiet origin "$rev"
  fi
  if ! git checkout --quiet --detach "$rev"; then
    err "Local changes block the checkout; commit or stash them, then re-run."
    exit 1
  fi
else
  log "Fetching the deployment files for $short_rev…"
  raw="https://raw.githubusercontent.com/$REPO_SLUG/$rev"
  stage="$(mktemp -d)"
  trap 'rm -rf "$stage"' EXIT
  fetch "$raw/deploy.files" "$stage/deploy.files"
  files="$(grep -v '^[[:space:]]*\(#\|$\)' "$stage/deploy.files")"
  for f in $files; do
    mkdir -p "$stage/files/$(dirname "$f")"
    fetch "$raw/$f" "$stage/files/$f"
  done
  # Everything downloaded, so swap them in. `mv` gives each file a new inode, so
  # replacing this very script doesn't disturb the shell that's running it.
  for f in $files deploy.files; do
    src="$stage/files/$f"
    [ "$f" = deploy.files ] && src="$stage/deploy.files"
    mkdir -p "$(dirname "$f")"
    case "$f" in *.sh) chmod +x "$src" ;; esac
    mv -f "$src" "$f"
  done
fi

env_set OMICRON_VERSION "$version"
[ "$registry" != "$DEFAULT_REGISTRY" ] && env_set OMICRON_REGISTRY "$registry"

# Rootless Podman can't bind ports < 1024 by default; nudge the user before the
# bind fails, but respect any explicit override they've already exported.
if [ "$ENGINE" = "podman" ] && [ "$(id -u)" != "0" ] && [ -z "${HTTP_PORT:-}" ]; then
  err "Rootless Podman usually can't bind ports 80/443."
  err "Re-run with e.g.  HTTP_PORT=8080 HTTPS_PORT=8443  (then browse to http://localhost:8080),"
  err "or allow low ports:  sudo sysctl net.ipv4.ip_unprivileged_port_start=80"
fi

log "Pulling the rest of the stack…"
$COMPOSE pull
log "Starting Omicron $version ($short_rev)…"
if [ "$ENGINE" = podman ]; then
  # podman-compose keeps a container on its old image unless it's recreated.
  $COMPOSE up -d --force-recreate
else
  $COMPOSE up -d
fi

# Drops only images nothing uses any more (the previous version's); never a volume.
"$ENGINE" image prune -f >/dev/null 2>&1 || true

log "Done. Omicron $version is starting."
printf '  • Local:   http://localhost%s\n' "$([ -n "${HTTP_PORT:-}" ] && [ "${HTTP_PORT}" != "80" ] && printf ':%s' "$HTTP_PORT")"
printf '  • Public:  point a DNS A record at this host, then finish the web wizard — HTTPS is automatic.\n'
printf '  • Logs:    (cd %s && %s logs -f)\n' "$OMICRON_DIR" "$COMPOSE"
printf '  • Update:  (cd %s && ./install.sh)\n' "$OMICRON_DIR"
