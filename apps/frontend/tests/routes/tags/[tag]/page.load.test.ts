// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { load } from "../../../../src/routes/tags/[tag]/+page";
import { apiError } from "../../../fakeFetch";
import { event } from "../../event";

test("the tag and its first page of posts", async () => {
  const data = await load(
    event({
      params: { tag: "deno" },
      routes: {
        "GET /api/tags/deno/detail": { tag: { slug: "deno" }, postCount: 2 },
        "GET /api/tags/deno/posts": { items: [], nextCursor: null },
      },
    }).event,
  );
  expect(data).toEqual({
    detail: { tag: { slug: "deno" }, postCount: 2 },
    page: { items: [], nextCursor: null },
  });
});

test("tags named like collection endpoints do not collide with /api/tags/following", async () => {
  const data = await load(
    event({
      params: { tag: "following" },
      routes: {
        "GET /api/tags/following": apiError(401, "You must be signed in."),
        "GET /api/tags/following/detail": { tag: { slug: "following" }, postCount: 0 },
        "GET /api/tags/following/posts": { items: [], nextCursor: null },
      },
    }).event,
  );
  expect(data).toEqual({
    detail: { tag: { slug: "following" }, postCount: 0 },
    page: { items: [], nextCursor: null },
  });
});

test("an aliased or differently cased tag redirects permanently to its canonical slug", async () => {
  await expect(
    load(
      event({
        params: { tag: "DenoJS" },
        routes: {
          "GET /api/tags/DenoJS/detail": { tag: { slug: "deno", name: "Deno" }, postCount: 2 },
          "GET /api/tags/DenoJS/posts": { items: [], nextCursor: null },
        },
      }).event,
    ),
  ).rejects.toMatchObject({ status: 308, location: "/tags/deno" });
});

test("an unknown tag is a 404; other failures propagate", async () => {
  await expect(load(event({ params: { tag: "nope" } }).event)).rejects.toMatchObject({ status: 404 });
  await expect(load(event({ params: { tag: "x" }, routes: { "*": apiError(500) } }).event)).rejects.toMatchObject({
    status: 500,
  });
});
