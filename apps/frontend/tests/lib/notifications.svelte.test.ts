// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { apiError, fakeFetch } from "./../fakeFetch";

const env = vi.hoisted(() => ({ browser: true }));
vi.mock(import("$app/environment"), () => ({
  get browser() {
    return env.browser;
  },
  building: false,
  dev: true,
  version: "test",
}));

async function load() {
  vi.resetModules();
  return (await import("$lib/notifications.svelte")).notifications;
}

let hidden = false;
beforeEach(() => {
  env.browser = true;
  hidden = false;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function stubCount(...counts: (number | Response)[]) {
  let i = 0;
  const { fetch } = fakeFetch({
    "GET /api/notifications/unread-count": () => {
      const next = counts[Math.min(i++, counts.length - 1)];
      return next instanceof Response ? next : Response.json({ count: next });
    },
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

test("start polls immediately and every 30s while the tab is visible", async () => {
  const fetch = stubCount(2, 5);
  const store = await load();
  store.start();
  await vi.waitFor(() => expect(store.count).toBe(2));
  hidden = true;
  await vi.advanceTimersByTimeAsync(30_000);
  expect(fetch).toHaveBeenCalledTimes(1);
  hidden = false;
  await vi.advanceTimersByTimeAsync(30_000);
  expect(store.count).toBe(5);
  store.stop();
});

test("coming back to the tab refreshes at once", async () => {
  const fetch = stubCount(1, 7);
  const store = await load();
  store.start();
  await vi.waitFor(() => expect(store.count).toBe(1));
  document.dispatchEvent(new Event("visibilitychange"));
  await vi.waitFor(() => expect(store.count).toBe(7));
  expect(fetch).toHaveBeenCalledTimes(2);
  store.stop();
});

test("start is idempotent; stop zeroes the badge and ends polling", async () => {
  const fetch = stubCount(3);
  const store = await load();
  store.start();
  store.start();
  await vi.waitFor(() => expect(store.count).toBe(3));
  store.stop();
  expect(store.count).toBe(0);
  await vi.advanceTimersByTimeAsync(90_000);
  document.dispatchEvent(new Event("visibilitychange"));
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("a failed poll keeps the last count; clear empties it optimistically", async () => {
  stubCount(4, apiError(500));
  const store = await load();
  store.start();
  await vi.waitFor(() => expect(store.count).toBe(4));
  await store.refresh();
  expect(store.count).toBe(4);
  store.clear();
  expect(store.count).toBe(0);
  store.stop();
});

test("on the server nothing ever polls", async () => {
  env.browser = false;
  const fetch = stubCount(9);
  const store = await load();
  store.start();
  await store.refresh();
  store.stop();
  expect(fetch).not.toHaveBeenCalled();
});
