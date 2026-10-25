// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { expect, test } from "vitest";
import { clientCors } from "@/routes/clientCors.ts";
import type { AppEnv } from "@/routes/types.ts";

const app = new Hono<AppEnv>().use("*", clientCors).all("*", (c) => c.json({ ok: true }));
test("credentialless browser clients can register, exchange, revoke and use every API verb", async () => {
  for (const path of ["/api/v1/apps", "/oauth/token", "/oauth/revoke", "/api/posts/p", "/api/client"]) {
    const res = await app.request(path, {
      method: "OPTIONS",
      headers: {
        origin: "https://reader.example",
        "access-control-request-method": "PATCH",
        "access-control-request-headers": "authorization,content-type",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("PATCH");
    expect(res.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("authorization");
    expect(res.headers.has("access-control-allow-credentials")).toBe(false);
  }
});
test("CORS never exposes browser consent, login sessions or account security", async () => {
  for (const path of [
    "/api/oauth/authorize",
    "/api/oauth/connections",
    "/api/auth/token",
    "/api/auth/get-session",
    "/api/setup",
    "/oauth/authorize",
  ]) {
    const res = await app.request(path, { headers: { origin: "https://untrusted.example" } });
    expect(res.headers.has("access-control-allow-origin")).toBe(false);
  }
});
