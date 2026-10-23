// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test, vi } from "vitest";
import { createUmamiTracker, publicPath } from "#lib/umami.js";

const ID = "94db1cb1-74f4-4a40-ad6c-962362670409";
type Target = Window & { umami?: { track: ReturnType<typeof vi.fn> } };
const target = window as Target;
const url = (path: string) => new URL(path, location.origin);

beforeEach(() => {
  localStorage.clear();
  delete target.umami;
  document.querySelectorAll('script[src="/api/site/script.js"]').forEach((element) => element.remove());
});

function loaded() {
  const script = document.querySelector<HTMLScriptElement>('script[src="/api/site/script.js"]')!;
  const track = vi.fn().mockResolvedValue(undefined);
  target.umami = { track };
  script.dispatchEvent(new Event("load"));
  return { script, track };
}

test("loads only same-origin endpoints with automatic and enhanced tracking disabled", async () => {
  const tracker = createUmamiTracker();
  const pending = tracker.track(ID, url("/@ada/article?token=secret#private"), "https://search.example/find?q=secret");
  const { script, track } = loaded();
  await pending;
  expect(script.dataset).toMatchObject({
    websiteId: ID,
    hostUrl: `${location.origin}/api/site`,
    autoTrack: "false",
    doNotTrack: "true",
    excludeSearch: "true",
    excludeHash: "true",
  });
  const payload = track.mock.calls[0][0]({ website: ID, title: "Article" });
  expect(payload).toEqual({ website: ID, title: "Article", url: "/@ada/article", referrer: "https://search.example" });
  expect(script.dataset.distinctId).toBeUndefined();
  expect(script.dataset.performance).toBeUndefined();
  tracker.destroy();
});

test("one script serves initial and SPA pageviews; query/hash-only changes do not double count", async () => {
  const tracker = createUmamiTracker();
  const initial = tracker.track(ID, url("/"), "");
  const { track } = loaded();
  await initial;
  await tracker.track(ID, url("/?page=2#top"), "");
  expect(track).toHaveBeenCalledTimes(1);
  await tracker.track(ID, url("/@ada/article"), `${location.origin}/?token=secret`);
  expect(track).toHaveBeenCalledTimes(2);
  expect(track.mock.calls[1][0]({}).referrer).toBe("/");
  expect(document.querySelectorAll('script[src="/api/site/script.js"]')).toHaveLength(1);
  await tracker.track(ID, url("/admin"), "");
  await tracker.track(ID, url("/@ada/article"), `${location.origin}/admin?secret=1`);
  expect(track).toHaveBeenCalledTimes(3);
  expect(track.mock.calls[2][0]({}).referrer).toBe("");
  tracker.destroy();
});

test("a slow script never sends a stale pageview after navigation to a private route", async () => {
  const tracker = createUmamiTracker();
  const initial = tracker.track(ID, url("/"), "");
  await tracker.track(ID, url("/login?token=secret"), "");
  const { track } = loaded();
  await initial;
  expect(track).not.toHaveBeenCalled();
  tracker.destroy();
});

test("query-only navigation during collection cannot double-count a pageview", async () => {
  const tracker = createUmamiTracker();
  const initial = tracker.track(ID, url("/"), "");
  const { track } = loaded();
  let complete!: () => void;
  track.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );
  await Promise.resolve();
  expect(track).toHaveBeenCalledTimes(1);
  await tracker.track(ID, url("/?filter=1"), "");
  expect(track).toHaveBeenCalledTimes(1);
  complete();
  await initial;
  tracker.destroy();
});

test.for([
  "/admin",
  "/login",
  "/reset-password",
  "/oauth/authorize",
  "/compose",
  "/search",
  "/lists/private",
  "/dashboard",
  "/posts/123/edit",
])("%s never loads the tracker", async (path) => {
  const tracker = createUmamiTracker();
  await tracker.track(ID, url(path), "");
  expect(document.querySelector('script[src="/api/site/script.js"]')).toBeNull();
  tracker.destroy();
});

test.for(["/", "/@ada", "/@ada/article", "/tags/writing", "/about", "/privacy", "/contact", "/status"])(
  "%s is a public reading path",
  (path) => {
    expect(publicPath(path)).toBe(true);
  },
);

test.for(["disabled", "dnt", "gpc", "local-opt-out", "error-page"])("%s prevents loading", async (signal) => {
  const tracker = createUmamiTracker();
  if (signal === "dnt") Object.defineProperty(navigator, "doNotTrack", { configurable: true, value: "1" });
  if (signal === "gpc") Object.defineProperty(navigator, "globalPrivacyControl", { configurable: true, value: true });
  if (signal === "local-opt-out") localStorage.setItem("umami.disabled", "1");
  await tracker.track(signal === "disabled" ? null : ID, url("/"), "", signal !== "error-page");
  expect(document.querySelector('script[src="/api/site/script.js"]')).toBeNull();
  if (signal === "gpc") delete (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
  if (signal === "dnt") Reflect.deleteProperty(navigator, "doNotTrack");
  tracker.destroy();
});

test("blocked scripts fail silently and can retry on the next page", async () => {
  const tracker = createUmamiTracker();
  const first = tracker.track(ID, url("/"), "");
  document.querySelector('script[src="/api/site/script.js"]')!.dispatchEvent(new Event("error"));
  await expect(first).resolves.toBeUndefined();
  const second = tracker.track(ID, url("/@ada"), "");
  const { track } = loaded();
  await second;
  expect(track).toHaveBeenCalledTimes(1);
  tracker.destroy();
});

test("disabling removes the tracker and the existing Cloud session", async () => {
  const tracker = createUmamiTracker();
  const pending = tracker.track(ID, url("/"), "");
  const { track } = loaded();
  await pending;
  await tracker.track(null, url("/@ada"), "");
  expect(target.umami).toBeUndefined();
  expect(document.querySelector('script[src="/api/site/script.js"]')).toBeNull();
  expect(track).toHaveBeenCalledTimes(1);
  tracker.destroy();
});
