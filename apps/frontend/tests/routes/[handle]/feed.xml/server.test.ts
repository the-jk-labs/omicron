// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { GET } from "../../../../src/routes/[handle]/feed.xml/+server";
import { apiError } from "../../../fakeFetch";
import { post } from "../../../fixtures";
import { event } from "../../event";

const routes = {
  "GET /api/instance": { name: "Blogs" },
  "GET /api/seo": { indexingEnabled: true },
  "GET /api/users/ada": { user: { username: "ada", displayName: "Ada", bio: "" } },
  "GET /api/users/ada/posts": { items: [post()], nextCursor: null },
};

const feed = (overrides: Record<string, unknown> = {}, handle = "@ada") =>
  GET(
    event({ url: `https://blog.example/${handle}/feed.xml`, params: { handle }, routes: { ...routes, ...overrides } })
      .event,
  );

test("an author's posts as an RSS feed", async () => {
  const res = await feed();
  expect(res.headers.get("content-type")).toBe("application/rss+xml; charset=utf-8");
  const xml = await res.text();
  expect(xml).toContain("<title>Ada · Blogs</title>");
  expect(xml).toContain("<description>Articles by @ada on Blogs</description>");
  expect(xml).toContain("<link>https://blog.example/@ada/hello-world</link>");
  expect(xml).toContain('<atom:link href="https://blog.example/@ada/feed.xml"');
});

test("with indexing off the channel is served empty; a missing instance name falls back", async () => {
  const xml = await (
    await feed({ "GET /api/seo": { indexingEnabled: false }, "GET /api/instance": apiError(500) })
  ).text();
  expect(xml).not.toContain("<item>");
  expect(xml).toContain("<title>Ada · Omicron</title>");
});

test("remote handles and non-handles have no feed; an unknown user is a 404", async () => {
  await expect(feed({}, "@bob@remote.example")).rejects.toMatchObject({ status: 404 });
  await expect(feed({}, "ada")).rejects.toMatchObject({ status: 404 });
  await expect(feed({}, "@ghost")).rejects.toMatchObject({ status: 404, body: { message: "User not found" } });
  await expect(feed({ "GET /api/users/ada": apiError(500) })).rejects.toMatchObject({ status: 500 });
});
