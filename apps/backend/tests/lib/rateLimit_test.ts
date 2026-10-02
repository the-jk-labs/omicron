// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { beforeEach, describe, expect, test } from "vitest";
import { config } from "@/config.ts";
import { checkRateLimit, clientIp, rateLimit } from "@/lib/rateLimit.ts";

beforeEach(() => {
  config.RATE_LIMIT_ENABLED = true;
});

function ipApp() {
  const app = new Hono();
  app.get("/", (c) => c.text(clientIp(c)));
  return app;
}

describe("clientIp", () => {
  test("trusts only the rightmost x-forwarded-for hop", async () => {
    const res = await ipApp().request("/", { headers: { "x-forwarded-for": "6.6.6.6, 10.0.0.1, 203.0.113.9" } });
    expect(await res.text()).toBe("203.0.113.9");
  });

  test("trims whitespace and skips empty entries", async () => {
    const res = await ipApp().request("/", { headers: { "x-forwarded-for": " 1.1.1.1 ,  2.2.2.2 , " } });
    expect(await res.text()).toBe("2.2.2.2");
  });

  test("falls back to x-real-ip when x-forwarded-for has no usable entry", async () => {
    const res = await ipApp().request("/", { headers: { "x-forwarded-for": " , ", "x-real-ip": " 9.9.9.9 " } });
    expect(await res.text()).toBe("9.9.9.9");
  });

  test("uses x-real-ip when x-forwarded-for is absent", async () => {
    const res = await ipApp().request("/", { headers: { "x-real-ip": "8.8.8.8" } });
    expect(await res.text()).toBe("8.8.8.8");
  });

  test("is 'unknown' when no header or connection info is available", async () => {
    const res = await ipApp().request("/");
    expect(await res.text()).toBe("unknown");
  });
});

function limitedApp(max: number, name = `t-${Math.random()}`) {
  const app = new Hono();
  app.use("*", rateLimit({ windowMs: 60_000, max, name, key: (c) => c.req.header("x-user") ?? "anon" }));
  app.get("/", (c) => c.text("ok"));
  return app;
}

describe("rateLimit middleware", () => {
  test("annotates allowed responses with the remaining budget", async () => {
    const res = await limitedApp(3).request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("RateLimit-Limit")).toBe("3");
    expect(res.headers.get("RateLimit-Remaining")).toBe("2");
    expect(Number(res.headers.get("RateLimit-Reset"))).toBeGreaterThan(0);
    expect(res.headers.get("Retry-After")).toBe(null);
  });

  test("answers 429 with Retry-After once the budget is spent", async () => {
    const app = limitedApp(2);
    await app.request("/");
    await app.request("/");
    const res = await app.request("/");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Too many requests. Please slow down and try again." });
    expect(res.headers.get("Retry-After")).toBe(res.headers.get("RateLimit-Reset"));
    expect(res.headers.get("RateLimit-Remaining")).toBe("0");
  });

  test("keys buckets with the custom key function", async () => {
    const app = limitedApp(1);
    expect((await app.request("/", { headers: { "x-user": "a" } })).status).toBe(200);
    expect((await app.request("/", { headers: { "x-user": "a" } })).status).toBe(429);
    expect((await app.request("/", { headers: { "x-user": "b" } })).status).toBe(200);
  });

  test("is a pass-through when rate limiting is disabled", async () => {
    config.RATE_LIMIT_ENABLED = false;
    const app = limitedApp(1);
    for (let i = 0; i < 3; i++) {
      const res = await app.request("/");
      expect(res.status).toBe(200);
      expect(res.headers.get("RateLimit-Limit")).toBe(null);
    }
  });
});

describe("checkRateLimit", () => {
  test("reports allowed until the budget is spent, keyed by client IP", async () => {
    const name = `c-${Math.random()}`;
    const app = new Hono();
    app.get("/", async (c) => c.json(await checkRateLimit(c, { windowMs: 60_000, max: 1, name })));
    const headers = { "x-forwarded-for": "1.2.3.4" };
    expect(await (await app.request("/", { headers })).json()).toMatchObject({ allowed: true });
    const denied = await (await app.request("/", { headers })).json();
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfter).toBeGreaterThan(0);
    expect(await (await app.request("/", { headers: { "x-forwarded-for": "5.6.7.8" } })).json()).toMatchObject({
      allowed: true,
    });
  });

  test("always allows when disabled", async () => {
    config.RATE_LIMIT_ENABLED = false;
    const app = new Hono();
    app.get("/", async (c) => c.json(await checkRateLimit(c, { windowMs: 1, max: 0, name: "x" })));
    expect(await (await app.request("/")).json()).toEqual({ allowed: true, retryAfter: 0 });
  });
});
