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
