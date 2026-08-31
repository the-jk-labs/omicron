import type { Context } from "hono";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { cookieSecure } from "@/lib/cookies.ts";

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

test("cookieSecure: https forwarded scheme ⇒ Secure, regardless of domain", () => {
  expect(cookieSecure(ctx("https"), "localhost:5173")).toBe(true);
  expect(cookieSecure(ctx("HTTPS"), "localhost:5173")).toBe(true);
  // A comma-joined chain uses the first (client-facing) hop.
  expect(cookieSecure(ctx("https, http"), "localhost:5173")).toBe(true);
});

test("cookieSecure: http forwarded scheme ⇒ not Secure (local dev over http)", () => {
  expect(cookieSecure(ctx("http"), "localhost:5173")).toBe(false);
  expect(cookieSecure(ctx("http"), "blog.example.com")).toBe(false);
});

test("cookieSecure: no forwarded scheme falls back to the domain heuristic", () => {
  expect(cookieSecure(ctx(undefined), "blog.example.com")).toBe(true);
  expect(cookieSecure(ctx(undefined), "localhost:5173")).toBe(false);
});
