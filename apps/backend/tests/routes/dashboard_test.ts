// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, vi } from "vitest";
import { mount } from "./harness.ts";

vi.mock(import("@/services/analytics.ts"));

import { dashboardRoutes } from "@/routes/dashboard.ts";
import { dashboardFor } from "@/services/analytics.ts";

const api = mount("/api/dashboard", dashboardRoutes);

test("requires a signed-in user", async () => {
  api.signOut();
  expect((await api.request("/api/dashboard")).status).toBe(401);
});

test.for([
  ["", 30],
  ["?days=7", 7],
  ["?days=0", 30],
  ["?days=-4", 1],
  ["?days=9999", 365],
  ["?days=abc", 30],
  ["?days=1.5", 1.5],
])("%s asks for %d days", async ([query, days]) => {
  api.signIn();
  vi.mocked(dashboardFor).mockResolvedValue({ ok: true } as never);
  expect(await (await api.request(`/api/dashboard${query}`)).json()).toEqual({ ok: true });
  expect(dashboardFor).toHaveBeenCalledWith("me", days);
});
