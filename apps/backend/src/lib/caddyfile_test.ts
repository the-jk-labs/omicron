// SPDX-License-Identifier: AGPL-3.0-or-later
import { assert, assertStringIncludes, assertThrows } from "@std/assert";
import { routeThroughAnubis } from "@/lib/caddyfile.ts";

// The toggle is one substring replacement in the operator's own Caddyfile, and
// every way it can go wrong is silent: Caddy accepts the result either way, the
// admin page reports success either way, and the only difference is whether the
// shield is actually in the request path. So the shipped Caddyfile is checked
// here, as a file, rather than the logic being checked against a fixture that
// cannot drift with it.

const CADDYFILE = await Deno.readTextFile(new URL("../../../../Caddyfile", import.meta.url));

Deno.test("the shipped Caddyfile is routed through Anubis, upstream and nothing else", () => {
  const routed = routeThroughAnubis(CADDYFILE);
  assertStringIncludes(routed, "reverse_proxy anubis:8080");
  assert(
    !routed.includes("reverse_proxy frontend:3000"),
    "the app upstream survived the swap — the shield would not be in the path",
  );
});

Deno.test("an ambiguous Caddyfile is refused, not guessed at", async (t) => {
  await t.step("a second mention, as in a comment above the directive", () => {
    // This is the trap: `String.replace` would rewrite the comment and leave the
    // directive alone, and nothing downstream could tell.
    assertThrows(() =>
      routeThroughAnubis("# see reverse_proxy frontend:3000\n\treverse_proxy frontend:3000\n")
    );
  });

  await t.step("no upstream to swap at all", () => {
    assertThrows(() => routeThroughAnubis("handle {\n\trespond 200\n}\n"));
  });
});

// The challenge screen's stylesheet is three files agreeing with each other:
// the Caddyfile answers Anubis's own stylesheet URL out of /srv, the compose
// file mounts anubis-theme.css there, and the file exists to be served. Break
// any one of those links — a rename, a moved mount — and nothing errors: Caddy
// 404s the path, Anubis serves its own CSS, and the first page a visitor sees
// quietly goes back to looking like someone else's site. Nobody would notice
// until they looked.
Deno.test("the challenge screen's stylesheet is wired end to end", async () => {
  assertStringIncludes(CADDYFILE, "@anubis_theme path /.within.website/x/xess/xess.min.css");
  assertStringIncludes(CADDYFILE, "root * /srv");
  assertStringIncludes(CADDYFILE, "rewrite * /anubis-theme.css");

  const compose = await Deno.readTextFile(
    new URL("../../../../docker-compose.yml", import.meta.url),
  );
  assertStringIncludes(compose, "./anubis-theme.css:/srv/anubis-theme.css:ro");

  const css = await Deno.readTextFile(new URL("../../../../anubis-theme.css", import.meta.url));
  assert(css.length > 0, "anubis-theme.css is shipped but empty");
});
