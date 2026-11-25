#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# What the real Caddyfile compresses. Stand-in upstreams answer each path with a
# fixed Content-Type (and, for the web app's HTML, an encoding of its own):
#   tests/deploy/compression.test.sh podman      (or: docker)
set -eu

ENGINE="${1:?usage: compression.test.sh <podman|docker>}"
repo="$(cd "$(dirname "$0")/../.." && pwd)"
caddy_image="$(grep -oE 'image: (docker.io/library/)?caddy:[^ ]+' "$repo/docker-compose.yml" | head -n 1 | cut -d' ' -f2)"
net="omicron-encode-test-$$"

cleanup() {
  "$ENGINE" rm -f "$net-backend" "$net-frontend" "$net-caddy" > /dev/null 2>&1 || true
  "$ENGINE" network rm "$net" > /dev/null 2>&1 || true
}
trap cleanup EXIT
"$ENGINE" network create "$net" > /dev/null

# Answers 4 KB of text with the Content-Type the path names, e.g. /api/json →
# application/json; /gzipped is HTML the upstream already gzipped itself.
stand_in='import gzip, http.server as h, sys
TYPES = {"json": "application/json", "activity": "application/activity+json", "html": "text/html",
         "png": "image/png", "gzipped": "text/html"}
class S(h.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def do_GET(s):
        kind = s.path.rstrip("/").rsplit("/", 1)[-1] or "html"
        body = b"{\"text\": \"" + b"omicron " * 512 + b"\"}"
        s.send_response(200)
        s.send_header("Content-Type", TYPES.get(kind, "text/html"))
        if kind == "gzipped":
            body = gzip.compress(body); s.send_header("Content-Encoding", "gzip")
        s.send_header("Content-Length", str(len(body))); s.end_headers(); s.wfile.write(body)
    def log_message(s, *a): pass
h.ThreadingHTTPServer(("", int(sys.argv[1])), S).serve_forever()'
for upstream in backend:8000 frontend:3000; do
  name="${upstream%%:*}" port="${upstream##*:}"
  "$ENGINE" run -d --name "$net-$name" --network "$net" --network-alias "$name" \
    docker.io/library/python:3.13-alpine python -c "$stand_in" "$port" > /dev/null
done

"$ENGINE" run -d --name "$net-caddy" --network "$net" --network-alias caddy \
  -v "$repo/Caddyfile:/etc/caddy/Caddyfile:ro,z" --tmpfs /run/caddy-admin "$caddy_image" > /dev/null

# The response's Content-Encoding for a path, or "none". The client asks for
# zstd and gzip the way browsers do.
encoding() { # path
  "$ENGINE" run --rm --network "$net" docker.io/library/python:3.13-alpine python -c '
import sys, urllib.request
req = urllib.request.Request("http://caddy" + sys.argv[1], headers={"Host": "localhost", "Accept-Encoding": "zstd, gzip"})
print(urllib.request.urlopen(req, timeout=5).headers.get("Content-Encoding") or "none")' "$1"
}

for _ in $(seq 1 30); do
  if encoding /api/json > /dev/null 2>&1 && encoding / > /dev/null 2>&1; then break; fi
  sleep 1
done

failures=0
expect() { # description actual expected
  if [ "$2" = "$3" ]; then echo "ok: $1"; else echo "FAIL: $1 (got '$2', want '$3')"; failures=$((failures + 1)); fi
}

expect "API JSON is compressed" "$(encoding /api/json)" zstd
expect "ActivityPub documents are compressed" "$(encoding /users/activity)" zstd
expect "uncompressed HTML from the web app is compressed" "$(encoding /html)" zstd
expect "HTML the web app already gzipped passes through as is" "$(encoding /gzipped)" gzip
expect "images are left alone" "$(encoding /api/png)" none

if [ "$failures" != 0 ]; then
  echo "$failures compression check(s) failed"
  exit 1
fi
echo "text responses are compressed exactly once"
