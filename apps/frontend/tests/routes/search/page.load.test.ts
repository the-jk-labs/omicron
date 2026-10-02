// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { load } from "../../../src/routes/search/+page";
import { event } from "../event";

test("an empty query asks the backend nothing", async () => {
  const { event: e, calls } = event({ url: "https://blog.example/search?q=%20%20" });
  expect(await load(e)).toEqual({
    query: "",
    tag: undefined,
    author: undefined,
    results: { posts: [], people: [], tags: [] },
  });
  expect(calls).toEqual([]);
});

test("query, tag and author are trimmed and forwarded", async () => {
  const results = { posts: [{ id: "p" }], people: [], tags: [] };
  const { event: e, calls } = event({
    url: "https://blog.example/search?q=+deno+&tag=%20runtime%20&author=",
    routes: { "GET /api/search": results },
  });
  expect(await load(e)).toEqual({ query: "deno", tag: "runtime", author: undefined, results });
  expect(calls[0].path).toBe("/api/search?q=deno&tag=runtime");
});
