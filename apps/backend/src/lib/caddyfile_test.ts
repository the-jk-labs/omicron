import { readFileSync } from "node:fs";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import { routeThroughAnubis } from "@/lib/caddyfile.ts";

// The toggle is one substring replacement in the operator's own Caddyfile, and
// every way it can go wrong is silent: Caddy accepts the result either way, the
// admin page reports success either way, and the only difference is whether the
// shield is actually in the request path. So the shipped Caddyfile is checked
// here, as a file, rather than the logic being checked against a fixture that
// cannot drift with it.

const CADDYFILE = readFileSync(new URL("../../../../Caddyfile", import.meta.url), "utf8");

test("the shipped Caddyfile is routed through Anubis, upstream and nothing else", () => {
  const routed = routeThroughAnubis(CADDYFILE);
  expect(routed).toContain("reverse_proxy anubis:8080");
  expect(
    routed.includes("reverse_proxy frontend:3000"),
    "the app upstream survived the swap — the shield would not be in the path",
  ).toBe(false);
});

describe("an ambiguous Caddyfile is refused, not guessed at", () => {
  test("a second mention, as in a comment above the directive", () => {
    // This is the trap: `String.replace` would rewrite the comment and leave the
    // directive alone, and nothing downstream could tell.
    expect(() => routeThroughAnubis("# see reverse_proxy frontend:3000\n\treverse_proxy frontend:3000\n")).toThrow(
      /exactly once/,
    );
  });

  test("no upstream to swap at all", () => {
    expect(() => routeThroughAnubis("handle {\n\trespond 200\n}\n")).toThrow(/exactly once/);
  });
});

// The challenge screen's stylesheet is three files agreeing with each other:
// the Caddyfile answers Anubis's own stylesheet URL out of /srv, the compose
// file mounts anubis-theme.css there, and the file exists to be served. Break
// any one of those links — a rename, a moved mount — and nothing errors: Caddy
// 404s the path, Anubis serves its own CSS, and the first page a visitor sees
// quietly goes back to looking like someone else's site. Nobody would notice
// until they looked.
test("the challenge screen's stylesheet is wired end to end", () => {
  expect(CADDYFILE).toContain("@anubis_theme path /.within.website/x/xess/xess.min.css");
  expect(CADDYFILE).toContain("root * /srv");
  expect(CADDYFILE).toContain("rewrite * /anubis-theme.css");

  const compose = readFileSync(new URL("../../../../docker-compose.yml", import.meta.url), "utf8");
  expect(compose).toContain("./anubis-theme.css:/srv/anubis-theme.css:ro");

  const css = readFileSync(new URL("../../../../anubis-theme.css", import.meta.url), "utf8");
  expect(css.length, "anubis-theme.css is shipped but empty").toBeGreaterThan(0);
});
