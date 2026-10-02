// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { apiError, fakeFetch } from "../fakeFetch";

// The snapshot lives in module state; each test starts from a fresh copy.
async function load() {
  vi.resetModules();
  return await import("$lib/instance");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

test("reads domain and live federation state, and holds them for a minute", async () => {
  const { instanceSnapshot } = await load();
  const { fetch } = fakeFetch({ "GET /api/instance": { domain: "blog.example", federationEnabled: true } });
  expect(await instanceSnapshot(fetch)).toEqual({ domain: "blog.example", federationEnabled: true });
  vi.advanceTimersByTime(59_999);
  await instanceSnapshot(fetch);
  expect(fetch).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1);
  await instanceSnapshot(fetch);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("a failed lookup degrades to nothing configured, and is cached too", async () => {
  const { instanceSnapshot } = await load();
  const { fetch } = fakeFetch({ "GET /api/instance": apiError(502) });
  expect(await instanceSnapshot(fetch)).toEqual({ domain: null, federationEnabled: false });
  await instanceSnapshot(fetch);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("missing fields default rather than leaking undefined", async () => {
  const { instanceSnapshot } = await load();
  const { fetch } = fakeFetch({ "GET /api/instance": {} });
  expect(await instanceSnapshot(fetch)).toEqual({ domain: null, federationEnabled: false });
});
