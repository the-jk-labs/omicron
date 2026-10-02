// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import { upgradeLegacyMarkdown } from "@/lib/legacyMarkdown.ts";

describe("upgradeLegacyMarkdown", () => {
  test.for([1, 2, 3, 4, 5, 6])("rebuilds an h%i heading", (level) => {
    expect(upgradeLegacyMarkdown(`<p>${"#".repeat(level)} Title</p>`)).toBe(`<h${level}>Title</h${level}>`);
  });

  test("leaves seven hashes alone (not a heading)", () => {
    expect(upgradeLegacyMarkdown("<p>####### Title</p>")).toBe("<p>####### Title</p>");
  });

  test("requires whitespace after the heading marker", () => {
    expect(upgradeLegacyMarkdown("<p>#hashtag</p>")).toBe("<p>#hashtag</p>");
  });

  test.for(["---", "***", "___", "---   "])("turns %j into a rule", (marker) => {
    expect(upgradeLegacyMarkdown(`<p>${marker}</p>`)).toBe("<hr>");
  });

  test("groups adjacent bullets into one list", () => {
    expect(upgradeLegacyMarkdown("<p>- one</p><p>* two</p><p>+ three</p>")).toBe(
      "<ul><li>one</li><li>two</li><li>three</li></ul>",
    );
  });

  test("groups adjacent ordered items into one list", () => {
    expect(upgradeLegacyMarkdown("<p>1. one</p><p>2. two</p>")).toBe("<ol><li>one</li><li>two</li></ol>");
  });

  test("groups adjacent escaped quote lines into one blockquote", () => {
    expect(upgradeLegacyMarkdown("<p>&gt; one</p><p>&gt; two</p>")).toBe(
      "<blockquote><p>one</p><p>two</p></blockquote>",
    );
  });

  test("a paragraph between two runs keeps them as separate lists", () => {
    expect(upgradeLegacyMarkdown("<p>- a</p><p>middle</p><p>- b</p>")).toBe(
      "<ul><li>a</li></ul><p>middle</p><ul><li>b</li></ul>",
    );
  });

  test("a bullet run followed by an ordered run produces two different lists", () => {
    expect(upgradeLegacyMarkdown("<p>- a</p><p>1. b</p>")).toBe("<ul><li>a</li></ul><ol><li>b</li></ol>");
  });

  test("keeps inline HTML inside items untouched", () => {
    expect(upgradeLegacyMarkdown('<p>- <strong>bold</strong> and <a href="https://x.test">link</a></p>')).toBe(
      '<ul><li><strong>bold</strong> and <a href="https://x.test">link</a></li></ul>',
    );
  });

  test("tolerates leading whitespace inside the paragraph", () => {
    expect(upgradeLegacyMarkdown("<p>   ## Title  </p>")).toBe("<h2>Title</h2>");
  });

  test("passes ordinary paragraphs and existing block markup through unchanged", () => {
    const html = "<h2>Real</h2><p>Plain text.</p><ul><li>real</li></ul><blockquote><p>q</p></blockquote>";
    expect(upgradeLegacyMarkdown(html)).toBe(html);
  });

  test("leaves paragraphs with attributes alone", () => {
    expect(upgradeLegacyMarkdown('<p class="x">- a</p>')).toBe('<p class="x">- a</p>');
  });

  test("returns empty input unchanged", () => {
    expect(upgradeLegacyMarkdown("")).toBe("");
  });

  test("is idempotent for a typical legacy post", () => {
    const once = upgradeLegacyMarkdown("<p>## Intro</p><p>text</p><p>- a</p><p>- b</p><p>&gt; quote</p><p>---</p>");
    expect(upgradeLegacyMarkdown(once)).toBe(once);
  });

  // BUG: the module promises a transform that is idempotent and "safe to run
  // repeatedly", but a quoted line whose text starts with a block marker becomes
  // a `<p>` inside the blockquote on the first run, and that `<p>` is matched
  // again as a list item on the second run.
  test.fails("BUG: is idempotent for a quoted line that starts with a list marker", () => {
    const once = upgradeLegacyMarkdown("<p>&gt; - item</p>");
    expect(upgradeLegacyMarkdown(once)).toBe(once);
  });

  // BUG: a correctly-authored paragraph that starts with "<number>. " (an escaped
  // Markdown `1984\. That year`, or a webhook body) is not a legacy list item,
  // but the backfill turns it into an ordered list anyway.
  test.fails("BUG: leaves a correctly-authored paragraph that starts with a year and a period alone", () => {
    expect(upgradeLegacyMarkdown("<p>1984. That was the year.</p>")).toBe("<p>1984. That was the year.</p>");
  });
});
