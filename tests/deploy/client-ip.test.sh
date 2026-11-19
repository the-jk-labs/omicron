#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Which client IP reaches the backend and the web app through the real Caddyfile.
# Stand-in upstreams echo the X-Forwarded-For and X-Real-IP they get; a "cdn"
# container forwards a visitor's request, an "attacker" container forges one.
# Every limiter and Anubis trust these headers, so they must carry the visitor:
#   tests/deploy/client-ip.test.sh podman      (or: docker)
set -eu

ENGINE="${1:?usage: client-ip.test.sh <podman|docker>}"
repo="$(cd "$(dirname "$0")/../.." && pwd)"
caddy_image="$(grep -oE 'image: (docker.io/library/)?caddy:[^ ]+' "$repo/docker-compose.yml" | head -n 1 | cut -d' ' -f2)"
net="omicron-ip-test-$$"
subnet_prefix="10.89.$(($$ % 200 + 20))"
cdn="$subnet_prefix.50" attacker="$subnet_prefix.60" visitor=198.51.100.7

cleanup() {
  "$ENGINE" rm -f "$net-backend" "$net-frontend" "$net-caddy" > /dev/null 2>&1 || true
  "$ENGINE" network rm "$net" > /dev/null 2>&1 || true
}
trap cleanup EXIT
"$ENGINE" network create --subnet "$subnet_prefix.0/24" "$net" > /dev/null

# A one-line HTTP server that answers with the client-IP headers it received.
echo_server='import http.server as h
class E(h.BaseHTTPRequestHandler):
    def do_GET(s):
        body = ("xff=%s|real=%s" % (s.headers.get("X-Forwarded-For", ""), s.headers.get("X-Real-IP", ""))).encode()
        s.send_response(200); s.send_header("Content-Length", str(len(body))); s.end_headers(); s.wfile.write(body)
    def log_message(s, *a): pass
import sys; h.HTTPServer(("", int(sys.argv[1])), E).serve_forever()'
for upstream in backend:8000 frontend:3000; do
  name="${upstream%%:*}" port="${upstream##*:}"
  "$ENGINE" run -d --name "$net-$name" --network "$net" --network-alias "$name" \
    docker.io/library/python:3.13-alpine python -c "$echo_server" "$port" > /dev/null
done

start_caddy() { # TRUSTED_PROXIES value
  "$ENGINE" rm -f "$net-caddy" > /dev/null 2>&1 || true
  "$ENGINE" run -d --name "$net-caddy" --network "$net" --network-alias caddy -e "TRUSTED_PROXIES=$1" \
    -v "$repo/Caddyfile:/etc/caddy/Caddyfile:ro,z" --tmpfs /run/caddy-admin "$caddy_image" > /dev/null
  for _ in $(seq 1 30); do
    "$ENGINE" run --rm --network "$net" "$caddy_image" wget -qO- --header "Host: localhost" http://caddy/api/x > /dev/null 2>&1 && return 0
    sleep 1
  done
  echo "Caddy didn't start:"; "$ENGINE" logs "$net-caddy" 2>&1 | tail -5; exit 1
}
ask() { # from-ip path forwarded-for → what the upstream saw
  "$ENGINE" run --rm --network "$net" --ip "$1" "$caddy_image" \
    wget -qO- --header "Host: localhost" --header "X-Forwarded-For: $3" "http://caddy$2"
}

failures=0
expect() { # description actual expected
  if [ "$2" = "$3" ]; then echo "ok: $1"; else echo "FAIL: $1 (got '$2', want '$3')"; failures=$((failures + 1)); fi
}

# No proxy trusted (the default): whoever connects is the client, and a forged header is ignored.
start_caddy ""
expect "untrusted: the API sees the connecting address" "$(ask "$cdn" /api/x "$visitor")" "xff=$cdn|real=$cdn"
expect "untrusted: the web app sees the connecting address" "$(ask "$cdn" / "$visitor")" "xff=$cdn|real=$cdn"

# The CDN is trusted: the visitor it forwards is the client, passed on as one address.
start_caddy "$cdn/32"
expect "trusted CDN: the API sees the visitor" "$(ask "$cdn" /api/x "$visitor")" "xff=$visitor|real=$visitor"
expect "trusted CDN: the web app sees the visitor" "$(ask "$cdn" / "$visitor")" "xff=$visitor|real=$visitor"
expect "trusted CDN: an address the visitor forged in front is ignored" "$(ask "$cdn" /api/x "6.6.6.6, $visitor")" "xff=$visitor|real=$visitor"
expect "trusted CDN: a host that isn't the CDN can't forge one" "$(ask "$attacker" /api/x "$visitor")" "xff=$attacker|real=$attacker"

if [ "$failures" != 0 ]; then
  echo "$failures client-IP check(s) failed"
  exit 1
fi
echo "every upstream sees the real client"
