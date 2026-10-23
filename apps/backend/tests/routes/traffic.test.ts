// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test, vi } from "vitest";
vi.mock(import("@/services/traffic.ts"));
import { trafficRoutes } from "@/routes/traffic.ts";
import { acceptsTraffic, recordPageview } from "@/services/traffic.ts";
import { mount } from "./harness.ts";

const api = mount("/api/traffic", trafficRoutes);
beforeEach(() => {
  api.signOut();
  vi.mocked(acceptsTraffic).mockResolvedValue(true);
  vi.mocked(recordPageview).mockResolvedValue(true);
});
test("issues separate secure, HttpOnly visitor and sliding visit cookies", async () => {
  const res = await api.json("/api/traffic/pageview", "POST", { path: "/" }, { "x-forwarded-proto": "https" });
  expect(res.status).toBe(204);
  expect(res.headers.get("cache-control")).toBe("no-store");
  const cookies = res.headers.getSetCookie();
  expect(cookies).toHaveLength(2);
  expect(cookies[0]).toMatch(/omicron_traffic_visitor=[0-9a-f]{32}/);
  expect(cookies[0]).toContain("Max-Age=34560000");
  expect(cookies[1]).toContain("Max-Age=1800");
  for (const cookie of cookies) expect(cookie).toMatch(/Path=\/api\/traffic;.*HttpOnly;.*Secure;.*SameSite=Lax/i);
});
test("reuses valid cookies; a pageview renews only the visit expiry", async () => {
  const token = "a".repeat(32);
  const res = await api.json(
    "/api/traffic/pageview",
    "POST",
    { path: "/about" },
    { cookie: `omicron_traffic_visitor=${token}; omicron_traffic_visit=${token}` },
  );
  expect(res.headers.getSetCookie()).toHaveLength(1);
  expect(recordPageview).toHaveBeenCalledWith(expect.objectContaining({ visitor: token, visit: token }));
});
test("privacy gates and staff exclude both counters and cookies", async () => {
  vi.mocked(acceptsTraffic).mockResolvedValue(false);
  expect((await api.json("/api/traffic/pageview", "POST", { path: "/" })).headers.getSetCookie()).toEqual([]);
  vi.mocked(acceptsTraffic).mockResolvedValue(true);
  for (const role of [{ isAdmin: true }, { isModerator: true }]) {
    api.signIn(role);
    expect((await api.json("/api/traffic/pageview", "POST", { path: "/" })).status).toBe(204);
  }
  expect(recordPageview).not.toHaveBeenCalled();
});
test("unrecorded pages do not get cookies", async () => {
  vi.mocked(recordPageview).mockResolvedValue(false);
  expect((await api.json("/api/traffic/pageview", "POST", { path: "/admin" })).headers.getSetCookie()).toEqual([]);
});
test("caps and validates payloads", async () => {
  expect((await api.json("/api/traffic/pageview", "POST", { path: "/", padding: "x".repeat(5000) })).status).toBe(413);
  expect((await api.json("/api/traffic/pageview", "POST", { nope: true })).status).toBe(400);
  expect((await api.request("/api/traffic/pageview", { method: "POST", body: "bad-json" })).status).toBe(400);
  expect(recordPageview).not.toHaveBeenCalled();
});
test("aggregation failure is contained and never issues a cookie", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(recordPageview).mockRejectedValue(new Error("database unavailable"));
  const res = await api.json("/api/traffic/pageview", "POST", { path: "/" });
  expect(res.status).toBe(204);
  expect(res.headers.getSetCookie()).toEqual([]);
});
