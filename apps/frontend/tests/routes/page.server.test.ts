// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { load } from "../../src/routes/+page.server";
import { event, user } from "./event";

const routes = {
  "GET /api/feed": { items: ["mine"], nextCursor: null },
  "GET /api/posts": { items: ["everyone"], nextCursor: null },
};

test("a signed-in reader gets their personal feed", async () => {
  expect(await load(event({ routes, user: user() }).event)).toEqual({
    page: { items: ["mine"], nextCursor: null },
    personalized: true,
  });
});

test("a guest gets the global timeline", async () => {
  expect(await load(event({ routes }).event)).toEqual({
    page: { items: ["everyone"], nextCursor: null },
    personalized: false,
  });
});
