// SPDX-License-Identifier: AGPL-3.0-or-later
import { load } from "cheerio";
import { expect, test } from "vitest";
import { absoluteContentUrls } from "@/lib/absoluteContentUrls.ts";
import { accessibilityContent, expectAccessibleContent } from "../accessibilityContent.ts";

const base = new URL("https://publisher.example/@ada/report");

test("body images and long-description links use the publisher's canonical page context", () => {
  const html = absoluteContentUrls(accessibilityContent, base);
  expectAccessibleContent(html, "https://publisher.example/api/uploads/chart.png");
  const $ = load(html, {}, false);
  expect($("a").attr("href")).toBe(`${base.href}#omicron-content-graph-description`);
  expect($('img[alt=""]').attr("src")).toBe("https://publisher.example/api/uploads/decoration.png");
});

test("relative paths, query strings and empty links resolve like the original page", () => {
  const $ = load(
    absoluteContentUrls(
      '<a href="../notes">Notes</a><a href="?view=full">Full</a><a href="">This page</a><img src="images/a.png?x=1&amp;y=2" alt="A graph">',
      base,
    ),
    {},
    false,
  );
  expect(
    $("a")
      .map((index, element) => $(element).attr("href"))
      .get(),
  ).toEqual(["https://publisher.example/notes", `${base.href}?view=full`, base.href]);
  expect($("img").attr("src")).toBe("https://publisher.example/@ada/images/a.png?x=1&y=2");
});

test("absolute and mailto references stay byte-for-byte unchanged", () => {
  const html =
    '<p lang="fr">Text</p><a href="mailto:ada@example.test">Email</a><img alt="" src="https://images.example/a.png">';
  expect(absoluteContentUrls(html, base)).toBe(html);
});

test("resolving references does not mutate metadata or double-escape values", () => {
  const html =
    '<p id="description">Details</p><img src="/a.png?x=1&amp;y=2" alt="A &amp; B" aria-describedby="description" lang="en" dir="ltr">';
  const result = absoluteContentUrls(html, base);
  expect(result).toContain('alt="A &amp; B"');
  expect(result).toContain('aria-describedby="description"');
  expect(result).not.toContain("&amp;amp;");
  expect(absoluteContentUrls(result, base)).toBe(result);
});

test("an invalid relative reference cannot abort building a federated body", () => {
  const html = '<img src="//[invalid" alt="A description">';
  expect(absoluteContentUrls(html, base)).toBe(html);
});
