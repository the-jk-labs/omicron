// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { GET } from "../../../../../src/routes/lists/[id]/feed.xml/+server";
import { apiError, type Routes } from "../../../../fakeFetch";
import { post } from "../../../../fixtures";
import { event } from "../../../event";

const LIST = { id: "66635376-1111-2222-3333-444444444444", title: "Weekend reads", description: "" };
const routes = {
  "GET /api/instance": { name: "Blogs" },
  "GET /api/seo": { indexingEnabled: true },
  "GET /api/lists/66635376": { list: LIST, owner: { displayName: "Ada" } },
  [`GET /api/lists/${LIST.id}/items`]: { items: [post()], nextCursor: null },
};

const feed = (overrides: Routes = {}, id = "weekend-reads-66635376") =>
  GET(
    event({ url: `https://blog.example/lists/${id}/feed.xml`, params: { id }, routes: { ...routes, ...overrides } })
      .event,
  );

test("a list's items as an RSS feed linking back to the list", async () => {
  const xml = await (await feed()).text();
  expect(xml).toContain("<title>Weekend reads · Blogs</title>");
  expect(xml).toContain("<description>A reading list by Ada on Blogs</description>");
  expect(xml).toContain("<link>https://blog.example/lists/weekend-reads-66635376</link>");
  expect(xml).toContain("<item>");
});

test("with indexing off the feed has no items", async () => {
  expect(await (await feed({ "GET /api/seo": { indexingEnabled: false } })).text()).not.toContain("<item>");
});

test("missing, private or unparseable lists are a 404; other failures propagate", async () => {
  await expect(feed({}, "no-id")).rejects.toMatchObject({ status: 404 });
  await expect(feed({ "GET /api/lists/66635376": apiError(404) })).rejects.toMatchObject({ status: 404 });
  await expect(feed({ "GET /api/lists/66635376": apiError(401) })).rejects.toMatchObject({ status: 404 });
  await expect(feed({ "GET /api/lists/66635376": apiError(500) })).rejects.toMatchObject({ status: 500 });
});
