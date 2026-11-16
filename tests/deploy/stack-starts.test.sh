#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Starts the real docker-compose.yml with a compose engine and checks that every
# service comes up. Omicron's own images are swapped for a stand-in that only
# sleeps: what is under test is the stack's wiring (dependencies, secrets),
# which is the same for any image.
#   tests/deploy/stack-starts.test.sh "podman-compose"
#   tests/deploy/stack-starts.test.sh "docker compose"
set -eu

COMPOSE="${1:?usage: stack-starts.test.sh <compose command>}"
ENGINE="${COMPOSE%% *}"
ENGINE="${ENGINE%-compose}"
repo="$(cd "$(dirname "$0")/../.." && pwd)"

work="$(mktemp -d)"
project="omicron-stack-test-$$"
cleanup() {
  (cd "$work/$project" && $COMPOSE down -v --remove-orphans > /dev/null 2>&1) || true
  rm -rf "$work"
}
trap cleanup EXIT

# The files an image install gets, in a directory that names the project.
mkdir -p "$work/$project"
grep -v '^[[:space:]]*\(#\|$\)' "$repo/deploy.files" | while read -r f; do
  mkdir -p "$work/$project/$(dirname "$f")"
  cp "$repo/$f" "$work/$project/$f"
done
cd "$work/$project"
cat > stand-in.yml <<'EOF'
services:
  backend: &stand-in
    image: docker.io/library/alpine:3.24.4
    entrypoint: ["sleep", "infinity"]
    healthcheck: { disable: true }
  frontend: *stand-in
  backup: *stand-in
EOF
export COMPOSE_FILE=docker-compose.yml:stand-in.yml
export HTTP_PORT=18080 HTTPS_PORT=18443

# Starting can hang on a broken dependency, so it gets a deadline of its own.
# shellcheck disable=SC2086 # the compose command is one or two words
timeout 300 $COMPOSE up -d > up.log 2>&1 || { echo "up failed or timed out:"; tail -20 up.log; }

failures=0
for service in postgres redis backend frontend backup anubis caddy; do
  state="$("$ENGINE" ps -a --filter "label=com.docker.compose.project=$project" \
    --filter "label=com.docker.compose.service=$service" --format '{{.State}}' | head -n 1)"
  case "$state" in
    running | Running | up | Up) echo "ok: $service is running" ;;
    *)
      echo "FAIL: $service is '${state:-missing}', not running"
      $COMPOSE logs --tail 15 "$service" 2>&1 | sed 's/^/    /'
      failures=$((failures + 1))
      ;;
  esac
done

if [ "$failures" != 0 ]; then
  echo "$failures service(s) did not start with $COMPOSE"
  exit 1
fi
echo "every service started with $COMPOSE"
