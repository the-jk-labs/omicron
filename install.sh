#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Omicron one-command installer.
#
#   curl -fsSL https://raw.githubusercontent.com/the-jk-labs/omicron/main/install.sh | sh
#
# Fetches the repository (git clone, or a source tarball when git is absent) and
# brings the stack up with Docker or Podman. No prebuilt images: the compose file
# builds from source, so the whole repo is fetched. Re-running upgrades in place
# (git pull + rebuild) without losing data — everything lives in named volumes.
#
# Environment overrides:
#   OMICRON_DIR   install directory        (default: ./omicron)
#   OMICRON_REF   branch/tag to fetch      (default: main)
#   HTTP_PORT     host HTTP port           (default: 80;   set e.g. 8080 for rootless podman)
#   HTTPS_PORT    host HTTPS port          (default: 443;  set e.g. 8443 for rootless podman)

set -eu

REPO_URL="https://github.com/the-jk-labs/omicron.git"
REPO_SLUG="the-jk-labs/omicron"
OMICRON_DIR="${OMICRON_DIR:-omicron}"
OMICRON_REF="${OMICRON_REF:-main}"

log() { printf '\033[1m▶ %s\033[0m\n' "$*"; }
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

if ! detect_compose; then
  err "No container engine found. Install Docker (with the Compose plugin) or Podman, then re-run."
  exit 1
fi
log "Using: $COMPOSE ($ENGINE)"

# Fetch or update the source into $OMICRON_DIR.
if [ -d "$OMICRON_DIR/.git" ] && have git; then
  log "Updating existing checkout in $OMICRON_DIR"
  git -C "$OMICRON_DIR" pull --ff-only
elif [ -e "$OMICRON_DIR" ] && [ -f "$OMICRON_DIR/docker-compose.yml" ]; then
  log "Reusing existing source in $OMICRON_DIR (no git; not updating)"
elif have git; then
  log "Cloning $REPO_URL into $OMICRON_DIR"
  git clone --branch "$OMICRON_REF" --depth 1 "$REPO_URL" "$OMICRON_DIR"
else
  log "git not found — downloading source tarball for $OMICRON_REF"
  if ! have curl && ! have wget; then
    err "Need git, curl, or wget to fetch the source."
    exit 1
  fi
  tarball="https://codeload.github.com/${REPO_SLUG}/tar.gz/refs/heads/${OMICRON_REF}"
  tmp="$(mktemp -d)"
  if have curl; then curl -fsSL "$tarball" -o "$tmp/src.tar.gz"; else wget -qO "$tmp/src.tar.gz" "$tarball"; fi
  mkdir -p "$OMICRON_DIR"
  # Strip the leading `omicron-<ref>/` directory from the archive.
  tar -xzf "$tmp/src.tar.gz" -C "$OMICRON_DIR" --strip-components=1
  rm -rf "$tmp"
fi

cd "$OMICRON_DIR"

# Rootless Podman can't bind ports < 1024 by default; nudge the user before the
# bind fails, but respect any explicit override they've already exported.
if [ "$ENGINE" = "podman" ] && [ "$(id -u)" != "0" ] && [ -z "${HTTP_PORT:-}" ]; then
  err "Rootless Podman usually can't bind ports 80/443."
  err "Re-run with e.g.  HTTP_PORT=8080 HTTPS_PORT=8443  (then browse to http://localhost:8080),"
  err "or allow low ports:  sudo sysctl net.ipv4.ip_unprivileged_port_start=80"
fi

log "Building and starting the stack (first run compiles images; this can take a few minutes)…"
# shellcheck disable=SC2086
$COMPOSE up -d --build

log "Done. Omicron is starting."
printf '  • Local:   http://localhost%s\n' "$([ -n "${HTTP_PORT:-}" ] && [ "${HTTP_PORT}" != "80" ] && printf ':%s' "$HTTP_PORT")"
printf '  • Public:  point a DNS A record at this host, then finish the web wizard — HTTPS is automatic.\n'
printf '  • Logs:    (cd %s && %s logs -f)\n' "$OMICRON_DIR" "$COMPOSE"
printf '  • Upgrade: (cd %s && git pull && %s up -d --build)\n' "$OMICRON_DIR" "$COMPOSE"
