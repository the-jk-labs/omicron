// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test, vi } from "vitest";
vi.mock(import("@/services/traffic.ts"));
vi.mock(import("@/services/settings.ts"));
import { adminRoutes } from "@/routes/admin.ts";
import { setTrafficEnabled } from "@/services/settings.ts";
import { summary } from "@/services/traffic.ts";
import { mount } from "./harness.ts";
const api = mount("/api/admin", adminRoutes);
beforeEach(() => api.signIn({ isAdmin: true }));
test("only admins can read traffic or change collection", async () => {
  for (const user of [null, {}, { isModerator: true }]) {
    if (user) api.signIn(user);
    else api.signOut();
    const expected = user ? 403 : 401;
    expect((await api.request("/api/admin/traffic")).status).toBe(expected);
    expect((await api.json("/api/admin/traffic/settings", "PUT", { enabled: true })).status).toBe(expected);
  }
  expect(summary).not.toHaveBeenCalled();
  expect(setTrafficEnabled).not.toHaveBeenCalled();
});
test("validates ranges and disables caching on private statistics", async () => {
  vi.mocked(summary).mockResolvedValue({ enabled: true } as never);
  const res = await api.request("/api/admin/traffic?from=2026-01-01&to=2026-01-31");
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(summary).toHaveBeenCalledWith(expect.objectContaining({ days: 31 }));
  expect((await api.request("/api/admin/traffic?from=invalid")).status).toBe(400);
});
test("collection settings require a boolean and persist", async () => {
  expect((await api.json("/api/admin/traffic/settings", "PUT", { enabled: "true" })).status).toBe(400);
  expect(await (await api.json("/api/admin/traffic/settings", "PUT", { enabled: true })).json()).toEqual({
    enabled: true,
  });
  expect(setTrafficEnabled).toHaveBeenCalledWith(true);
});
