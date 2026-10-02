import { FEED_HEADERS, firstSection, postFeedItem, renderRssFeed } from "$lib/rss";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import { post } from "../fixtures";

const ORIGIN = "https://blog.example";

describe("firstSection", () => {
  test("cuts at the first heading that follows some prose", () => {
    expect(firstSection("<h1>Title</h1><p>Intro.</p><h2>Part one</h2><p>Body.</p>")).toBe(
      "<h1>Title</h1><p>Intro.</p>",
    );
  });

  test("a post without headings is kept whole when short", () => {
    expect(firstSection("<p>Short.</p><p>Also short.</p>")).toBe("<p>Short.</p><p>Also short.</p>");
  });

  test("a long headingless post is cut on a block boundary under the cap", () => {
    const para = `<p>${"word ".repeat(50)}</p>`;
    const out = firstSection(para.repeat(10));
    expect(out).toBe(para.repeat(2));
  });

  test("never cuts inside an open container", () => {
    const item = `<li><p>${"word ".repeat(40)}</p></li>`;
    const html = `<p>Intro</p><ul>${item.repeat(5)}</ul><p>${"tail ".repeat(200)}</p>`;
    // The paragraphs inside the list close before the list does; cutting there
    // would leave a dangling <ul>, so the only safe cut is after "Intro".
    expect(firstSection(html)).toBe("<p>Intro</p>");
  });

  test("one huge paragraph falls back to an escaped plain-text excerpt", () => {
    const out = firstSection(`<p>Tom &amp; Jerry &lt;3 ${"word ".repeat(300)}</p>`);
    expect(out.startsWith("<p>Tom &amp; Jerry &lt;3 word")).toBe(true);
    expect(out.endsWith("</p>")).toBe(true);
    expect(out.length).toBeLessThan(700);
  });
});

describe("postFeedItem", () => {
  test("links back to the canonical post, absolutizes root-relative URLs and credits the author", () => {
    const item = postFeedItem(
      post({
        contentHtml: '<p><a href="/@bob">Bob</a> <img src="/api/uploads/a.webp"> <a href="//cdn.example/x">x</a></p>',
        tags: [{ slug: "deno", name: "Deno" }],
      }),
      ORIGIN,
    );
    expect(item.link).toBe(`${ORIGIN}/@ada/hello-world`);
    expect(item.descriptionHtml).toContain(`href="${ORIGIN}/@bob"`);
    expect(item.descriptionHtml).toContain(`src="${ORIGIN}/api/uploads/a.webp"`);
    expect(item.descriptionHtml).toContain('href="//cdn.example/x"');
    expect(item.descriptionHtml).toContain(`<a href="${item.link}">Read the full article</a>`);
    expect(item).toMatchObject({ title: "Hello world", creator: "Ada", categories: ["Deno"] });
  });

  test("an untitled post and an author without a display name still read", () => {
    const item = postFeedItem(
      post({ title: null, slug: null, author: { id: "a", username: "ada", displayName: "", avatarUrl: null } }),
      ORIGIN,
    );
    expect(item).toMatchObject({ title: "Untitled", creator: "ada", link: `${ORIGIN}/@ada/9e962281` });
  });
});

test("renders a well-formed RSS 2.0 channel with escaped fields", () => {
  const xml = renderRssFeed({
    title: "Ada & co",
    description: "<b>bio</b>",
    link: `${ORIGIN}/@ada`,
    feedUrl: `${ORIGIN}/@ada/feed.xml`,
    items: [
      {
        title: "A < B",
        link: `${ORIGIN}/@ada/a`,
        pubDate: "2026-01-02T03:04:05Z",
        creator: "Ada",
        descriptionHtml: "<p>Tom &amp; Jerry</p>",
        categories: ["c#"],
      },
    ],
  });
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  expect(doc.querySelector("parsererror")).toBe(null);
  expect(doc.querySelector("channel > title")?.textContent).toBe("Ada & co");
  expect(doc.querySelector("item > title")?.textContent).toBe("A < B");
  expect(doc.querySelector("item > pubDate")?.textContent).toBe("Fri, 02 Jan 2026 03:04:05 GMT");
  expect(doc.querySelector("item > description")?.textContent).toBe("<p>Tom &amp; Jerry</p>");
  expect(doc.querySelector("item > category")?.textContent).toBe("c#");
  expect(xml).toContain(`<atom:link href="${ORIGIN}/@ada/feed.xml" rel="self" type="application/rss+xml" />`);
  expect(FEED_HEADERS["access-control-allow-origin"]).toBe("*");
});
