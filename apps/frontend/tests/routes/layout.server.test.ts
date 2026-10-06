// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import { load } from "../../src/routes/+layout.server";
import { apiError } from "../fakeFetch";
import { event } from "./event";

const base = {
  "GET /api/instance": { setupComplete: true, name: "Omicron" },
  "GET /api/seo": { indexingEnabled: false, verification: { google: "g" } },
  "GET /api/me": { user: { id: "u1", username: "ada" } },
  "GET /api/posts/trending": { items: [1, 2, 3, 4, 5, 6].map((id) => ({ id })) },
  "GET /api/users/suggested": { items: [1, 2, 3, 4].map((id) => ({ id })) },
  "GET /api/tags": { tags: [1, 2, 3, 4, 5, 6, 7, 8].map((slug) => ({ slug })) },
};

const run = (opts: Parameters<typeof event>[0]) => load(event(opts).event) as Promise<Record<string, unknown>>;

describe("setup gate", () => {
  test("an instance that is not set up sends every page to the wizard", async () => {
    await expect(
      run({ routes: { ...base, "GET /api/instance": { setupComplete: false } }, routeId: "/" }),
    ).rejects.toMatchObject({ status: 303, location: "/setup" });
  });

  test("the wizard itself is reachable before setup and closed after", async () => {
    await expect(
      run({ routes: { ...base, "GET /api/instance": { setupComplete: false } }, routeId: "/setup" }),
    ).resolves.toBeDefined();
    await expect(run({ routes: base, routeId: "/setup" })).rejects.toMatchObject({ status: 303, location: "/" });
  });

  test("when the instance is unreachable the page still renders", async () => {
    const data = await run({ routes: { ...base, "GET /api/instance": apiError(502) }, routeId: "/" });
    expect(data.instance).toBe(null);
  });
});

test("passes the signed-in user, SEO settings, and validated zone and locale", async () => {
  const data = await run({
    routes: base,
    routeId: "/settings",
    cookies: { tz: "Asia/Baku", locale: "az-az" },
  });
  expect(data).toMatchObject({
    user: { username: "ada" },
    seo: { indexingEnabled: false },
    timeZone: "Asia/Baku",
    locale: "az-AZ",
    discover: null,
  });
});

test("bad cookies are dropped; the locale falls back to Accept-Language", async () => {
  const data = await run({
    routes: base,
    cookies: { tz: "Mars/Base", locale: "!!" },
    headers: { "accept-language": "tr;q=0.9, de;q=0.8" },
  });
  expect([data.timeZone, data.locale]).toEqual([null, "tr"]);
  expect((await run({ routes: base })).locale).toBe(null);
});

// Kept in localStorage before, the card and its switches flipped after hydration.
test("the feed language filter comes from its cookies, ignoring unknown languages", async () => {
  const data = await run({
    routes: base,
    cookies: { "feed-lang-mode": "hide", "feed-langs": "de,zz,az", "feed-lang-card-dismissed": "1" },
  });
  expect(data.feedFilter).toEqual({ mode: "hide", langs: ["de", "az"], cardDismissed: true });
  expect((await run({ routes: base })).feedFilter).toEqual({ mode: "show", langs: [], cardDismissed: false });
});

test("a failed /me or /seo degrades to signed out and indexable", async () => {
  const data = await run({
    routes: { ...base, "GET /api/me": apiError(500), "GET /api/seo": apiError(500) },
  });
  expect(data.user).toBe(null);
  expect(data.seo).toEqual({ indexingEnabled: true, verification: {} });
});

describe("discover rail", () => {
  test.for(["/", "/[handle]"])("is loaded and trimmed on %s", async (routeId) => {
    const { discover } = (await run({ routes: base, routeId })) as {
      discover: { posts: unknown[]; people: unknown[]; tags: unknown[] };
    };
    expect([discover.posts.length, discover.people.length, discover.tags.length]).toEqual([4, 3, 6]);
  });

  test("one failing source empties only its own column", async () => {
    const { discover } = (await run({
      routes: { ...base, "GET /api/users/suggested": apiError(500) },
      routeId: "/",
    })) as { discover: { posts: unknown[]; people: unknown[] } };
    expect(discover.people).toEqual([]);
    expect(discover.posts).toHaveLength(4);
  });
});
