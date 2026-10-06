// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { load } from "../../src/routes/+page.server";
import { event, user } from "./event";

const routes = {
  "GET /api/feed": { items: ["mine"], nextCursor: null },
  "GET /api/posts": { items: ["everyone"], nextCursor: null },
  "GET /api/posts?scope=local": { items: ["here"], nextCursor: null },
};

test("a signed-in reader gets their personal feed", async () => {
  expect(await load(event({ routes, user: user() }).event)).toEqual({
    page: { items: ["mine"], nextCursor: null },
    personalized: true,
    tab: "for-you",
  });
});

test("a guest gets the global timeline", async () => {
  expect(await load(event({ routes }).event)).toEqual({
    page: { items: ["everyone"], nextCursor: null },
    personalized: false,
    tab: "global",
  });
});

// Chosen in the browser before, the tab used to switch only after hydration.
test("the saved default feed is the tab the server renders", async () => {
  expect(await load(event({ routes, user: user(), cookies: { "default-feed": "local" } }).event)).toEqual({
    page: { items: ["here"], nextCursor: null },
    personalized: true,
    tab: "local",
  });
  expect(await load(event({ routes, cookies: { "default-feed": "local" } }).event)).toMatchObject({ tab: "local" });
});

test("a saved default that isn't offered or isn't a feed falls back", async () => {
  expect(await load(event({ routes, cookies: { "default-feed": "for-you" } }).event)).toMatchObject({
    tab: "global",
    page: { items: ["everyone"] },
  });
  expect(await load(event({ routes, user: user(), cookies: { "default-feed": "trending" } }).event)).toMatchObject({
    tab: "for-you",
  });
});
