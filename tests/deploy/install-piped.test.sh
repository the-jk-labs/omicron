#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Runs install.sh the way the README does, `curl … | sh`, with stand-ins for
# docker and curl. The docker stand-in reads stdin like the real CLI can, which
# must not eat the rest of a script that sh is still reading from the pipe.
#   tests/deploy/install-piped.test.sh
set -eu

repo="$(cd "$(dirname "$0")/../.." && pwd)"
rev="$(git -C "$repo" rev-parse HEAD)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"

cat > "$work/bin/docker" <<EOF
#!/bin/sh
cat > /dev/null # what a docker CLI may do with a stdin that isn't a terminal
echo "docker \$*" >> "$work/calls"
case "\$*" in
  "compose version") exit 0 ;;
  inspect*) echo "$rev" ;;
esac
exit 0
EOF

# Serves raw.githubusercontent.com/<slug>/<rev>/<path> from this checkout.
cat > "$work/bin/curl" <<EOF
#!/bin/sh
out=""; url=""
while [ \$# -gt 0 ]; do
  case "\$1" in -o) out="\$2"; shift ;; -*) ;; *) url="\$1" ;; esac
  shift
done
case "\$url" in
  https://raw.githubusercontent.com/*) path="\${url#https://raw.githubusercontent.com/*/*/*/}"; cp "$repo/\$path" "\$out" ;;
  *) exit 22 ;;
esac
EOF
chmod +x "$work/bin/docker" "$work/bin/curl"

status=0
cd "$work"
PATH="$work/bin:/usr/bin:/bin" OMICRON_DIR="$work/inst" sh < "$repo/install.sh" > "$work/out" 2>&1 || status=$?

failures=0
if [ "$status" = 0 ]; then echo "ok: the piped installer finishes"; else echo "FAIL: the piped installer exited $status"; failures=$((failures + 1)); fi
if grep -q "^docker compose up -d" "$work/calls" 2> /dev/null; then echo "ok: it starts the stack"; else echo "FAIL: it never ran 'docker compose up -d'"; failures=$((failures + 1)); fi
if grep -q "Done. Omicron stable is starting." "$work/out"; then echo "ok: it reaches the end"; else echo "FAIL: it stopped early"; failures=$((failures + 1)); fi
if [ "$failures" != 0 ]; then
  echo "--- installer output:"
  sed 's/\x1b\[[0-9;]*m//g' "$work/out" | tail -8
  exit 1
fi
echo "the piped installer runs to the end"
