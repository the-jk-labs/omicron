// SPDX-License-Identifier: AGPL-3.0-or-later
import { assertEquals } from "@std/assert";
import type { Context } from "hono";
import { cookieSecure } from "@/lib/session.ts";

// Minimal Context stub: cookieSecure only reads one request header.
function ctx(proto?: string): Context {
  return {
    req: { header: (name: string) => (name === "x-forwarded-proto" ? proto : undefined) },
  } as unknown as Context;
}

// The Secure flag on the session cookie is what keeps it off a plaintext hop.
// It must follow the real request scheme (forwarded by Caddy), not the
// boot-time domain — otherwise a wizard-configured HTTPS instance whose
// APP_DOMAIN stayed "localhost" ships the cookie without Secure.

Deno.test("cookieSecure: https forwarded scheme ⇒ Secure, regardless of domain", () => {
  assertEquals(cookieSecure(ctx("https"), "localhost:5173"), true);
  assertEquals(cookieSecure(ctx("HTTPS"), "localhost:5173"), true);
  // A comma-joined chain uses the first (client-facing) hop.
  assertEquals(cookieSecure(ctx("https, http"), "localhost:5173"), true);
});

Deno.test("cookieSecure: http forwarded scheme ⇒ not Secure (local dev over http)", () => {
  assertEquals(cookieSecure(ctx("http"), "localhost:5173"), false);
  assertEquals(cookieSecure(ctx("http"), "blog.example.com"), false);
});

Deno.test("cookieSecure: no forwarded scheme falls back to the domain heuristic", () => {
  assertEquals(cookieSecure(ctx(undefined), "blog.example.com"), true);
  assertEquals(cookieSecure(ctx(undefined), "localhost:5173"), false);
});
