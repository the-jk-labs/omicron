// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, expect, test } from "vitest";
import { healthRoutes } from "@/routes/health.ts";
import { seedFederationRunning } from "@/services/federationState.ts";
import { APP_VERSION } from "@/version.ts";

beforeEach(() => {
  seedFederationRunning(false);
});

afterEach(() => {
  seedFederationRunning(false);
});

test("/healthz answers ok", async () => {
  const res = await healthRoutes.request("/healthz");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});

test("/version reports the software, version and live federation state", async () => {
  expect(await (await healthRoutes.request("/version")).json()).toEqual({
    name: "omicron",
    version: APP_VERSION,
    federation: false,
  });
  seedFederationRunning(true);
  expect((await (await healthRoutes.request("/version")).json()).federation).toBe(true);
});
