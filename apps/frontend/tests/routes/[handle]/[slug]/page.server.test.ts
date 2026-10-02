// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { load } from "../../../../src/routes/[handle]/[slug]/+page.server";
import { apiError, type Routes } from "../../../fakeFetch";
import { post } from "../../../fixtures";
import { event } from "../../event";

const P = post({
  contentHtml: '<p>Hi</p><img src="/a.png"><pre><code class="language-js">let x = 1;</code></pre>',
  language: "tr",
});

function routes(overrides: Routes = {}) {
  return {
    "GET /api/posts/by/ada/hello-world": { post: P },
    [`GET /api/posts/${P.id}/comments`]: { items: [], nextCursor: null },
    [`GET /api/posts/${P.id}/related`]: { items: [{ id: "r1" }] },
    ...overrides,
  };
}

test("serves the post with comments, related posts, a decorated body and the page language", async () => {
  const { event: e, locals } = event({
    url: "https://blog.example/@ada/hello-world",
    params: { handle: "@ada", slug: "hello-world" },
    routes: routes(),
  });
  const data = (await load(e)) as { post: typeof P; related: unknown[] };
  expect(data.related).toEqual([{ id: "r1" }]);
  expect(data.post.contentHtml).toContain('loading="lazy"');
  expect(data.post.contentHtml).not.toContain('<code class="language-js">let x = 1;</code>');
  expect(locals.lang).toBe("tr");
});

test("a failing related rail costs nothing but the rail", async () => {
  const { event: e } = event({
    url: "https://blog.example/@ada/hello-world",
    params: { handle: "@ada", slug: "hello-world" },
    routes: routes({ [`GET /api/posts/${P.id}/related`]: apiError(500) }),
  });
  expect(((await load(e)) as { related: unknown[] }).related).toEqual([]);
});

test("an old slug or short-id link moves permanently to the current URL", async () => {
  const { event: e } = event({
    url: "https://blog.example/@ada/9e962281",
    params: { handle: "@ada", slug: "9e962281" },
    routes: routes({ "GET /api/posts/by/ada/9e962281": { post: P } }),
  });
  await expect(load(e)).rejects.toMatchObject({ status: 308, location: "/@ada/hello-world" });
});

test("a percent-encoded canonical path is not redirected to itself", async () => {
  const remote = post({
    slug: null,
    author: { id: "r", username: "bob@remote.example", displayName: "Bob", avatarUrl: null },
  });
  const { event: e } = event({
    url: "https://blog.example/@bob%40remote.example/9e962281",
    params: { handle: "@bob@remote.example", slug: "9e962281" },
    routes: {
      "GET /api/posts/by/bob%40remote.example/9e962281": { post: remote },
      [`GET /api/posts/${remote.id}/comments`]: { items: [] },
      [`GET /api/posts/${remote.id}/related`]: { items: [] },
    },
  });
  await expect(load(e)).resolves.toBeDefined();
});

test.for(["rss", "RSS", "feed", "atom.xml", "index.xml"])(
  "a guessed feed address (%s) redirects to the real feed",
  async (slug) => {
    const { event: e } = event({ params: { handle: "@ada", slug }, routes: {} });
    await expect(load(e)).rejects.toMatchObject({ status: 308, location: "/@ada/feed.xml" });
  },
);

test("a feed alias of a remote author, or any other unknown slug, is a 404", async () => {
  await expect(load(event({ params: { handle: "@bob@remote.example", slug: "rss" } }).event)).rejects.toMatchObject({
    status: 404,
  });
  await expect(load(event({ params: { handle: "@ada", slug: "nope" } }).event)).rejects.toMatchObject({
    status: 404,
    body: { message: "Post not found" },
  });
  await expect(load(event({ params: { handle: "ada", slug: "x" } }).event)).rejects.toMatchObject({ status: 404 });
});

test("a backend failure other than 404 propagates", async () => {
  const { event: e } = event({ params: { handle: "@ada", slug: "x" }, routes: { "*": apiError(503, "down") } });
  await expect(load(e)).rejects.toMatchObject({ status: 503 });
});
