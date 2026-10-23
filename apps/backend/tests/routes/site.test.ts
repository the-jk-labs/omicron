// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test, vi } from "vitest";
vi.mock(import("@/db/repositories/instanceSettings.ts"));
vi.mock(import("@/lib/rateLimitCore.ts"));
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import { hit } from "@/lib/rateLimitCore.ts";
import { siteRoutes } from "@/routes/site.ts";
import { mount } from "./harness.ts";

const api = mount("/api/site", siteRoutes);
const ID = "94db1cb1-74f4-4a40-ad6c-962362670409";
const body = {
  type: "event",
  payload: {
    website: ID,
    hostname: "blog.example",
    screen: "1920x1080",
    language: "en",
    title: "Article",
    url: "/@ada/article?secret=1",
    referrer: "",
  },
};

beforeEach(() => {
  vi.mocked(settingsRepo.get).mockResolvedValue({ enabled: true, websiteId: ID });
  vi.mocked(hit).mockResolvedValue({ allowed: true, remaining: 59, resetAt: Date.now() + 60_000 });
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ cache: "session" }));
});

test("disabled statistics never contact Cloud", async () => {
  vi.mocked(settingsRepo.get).mockResolvedValue(undefined);
  expect(await (await api.request("/api/site")).json()).toEqual({ websiteId: null });
  expect((await api.request("/api/site/script.js")).status).toBe(404);
  expect((await api.json("/api/site/api/send", "POST", body)).status).toBe(204);
  expect(fetch).not.toHaveBeenCalled();
});

test("the public configuration exposes only the enabled website ID and is not cached", async () => {
  const response = await api.request("/api/site");
  expect(await response.json()).toEqual({ websiteId: ID });
  expect(response.headers.get("cache-control")).toBe("no-store");
});

test.for(["dnt", "sec-gpc"])("%s opt-out never reaches Cloud", async (header) => {
  expect((await api.json("/api/site/api/send", "POST", body, { [header]: "1" })).status).toBe(204);
  expect(fetch).not.toHaveBeenCalled();
});

test("pageviews retain Cloud's response and trusted visitor headers, not credentials", async () => {
  const response = await api.json("/api/site/api/send", "POST", body, {
    "x-forwarded-for": "198.51.100.2, 192.0.2.1",
    "user-agent": "Reader",
    cookie: "session=secret",
    authorization: "Bearer secret",
    "x-umami-cache": "previous",
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ cache: "session" });
  expect(response.headers.get("cache-control")).toBe("no-store");
  const init = vi.mocked(fetch).mock.calls[0][1]!;
  const headers = new Headers(init.headers);
  expect(headers.get("x-forwarded-for")).toBe("192.0.2.1");
  expect(headers.get("x-umami-cache")).toBe("previous");
  expect(headers.has("cookie")).toBe(false);
  expect(headers.has("authorization")).toBe(false);
  expect(JSON.parse(init.body as string).payload.url).toBe("/@ada/article");
});

test.for([
  ["cross-site", 403, { "sec-fetch-site": "cross-site" }, JSON.stringify(body)],
  ["wrong type", 400, { "content-type": "text/plain" }, JSON.stringify(body)],
  ["malformed JSON", 400, {}, "{"],
  ["oversized body", 413, {}, "x".repeat(16_385)],
  ["oversized declared length", 413, { "content-length": "16385" }, "{}"],
  [
    "different website",
    400,
    {},
    JSON.stringify({ ...body, payload: { ...body.payload, website: "00000000-0000-4000-8000-000000000000" } }),
  ],
] as const)("rejects %s before forwarding", async ([, status, headers, content]) => {
  const response = await api.request("/api/site/api/send", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: content,
  });
  expect(response.status).toBe(status);
  expect(fetch).not.toHaveBeenCalled();
});

test("a Cloud outage returns a generic error, not upstream details", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("private upstream detail"));
  const response = await api.json("/api/site/api/send", "POST", body);
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: "Site statistics unavailable." });
});

test("collection is rate-limited per trusted client IP before contacting Cloud", async () => {
  vi.mocked(hit).mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });
  const response = await api.json("/api/site/api/send", "POST", body, { "x-forwarded-for": "forged, 192.0.2.1" });
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).not.toBeNull();
  expect(hit).toHaveBeenCalledExactlyOnceWith("site-pageview:192.0.2.1", 60_000, 60);
  expect(fetch).not.toHaveBeenCalled();
});

test("script responses have a JavaScript MIME type and no upstream cookies", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response("/* tracker */", {
      headers: { "content-type": "application/javascript", "set-cookie": "secret=value" },
    }),
  );
  const response = await api.request("/api/site/script.js");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/javascript; charset=utf-8");
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(await response.text()).toBe("/* tracker */");
});
