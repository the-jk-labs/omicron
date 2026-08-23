// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { isEscapedBody, repairEscapedBody, unexpectedTags } from "@/lib/unescapeBody.ts";

// What these guard is a one-way edit to stored rows: the repair overwrites the
// body of every post it matches. Leaving a post alone is always acceptable;
// rewriting one that was never damaged is not.

// A body exactly as the editor stored it: the ingested HTML escaped, one
// paragraph per line of the original.
const damaged = [
  "<p>&lt;p&gt;This post is synced from &lt;a href=&quot;https://example.com/blog/post&quot;",
  " rel=&quot;noopener noreferrer nofollow&quot; target=&quot;_blank&quot;&gt;my website&lt;/a&gt;",
  " using webhooks.&lt;/p&gt;</p><p>&lt;h2&gt;1. Rendering&lt;/h2&gt;</p>",
].join("");

test("escaped body: the damage is recognised", () => {
  expect(isEscapedBody(damaged)).toBe(true);
});

test("escaped body: the original markup comes back", () => {
  const out = repairEscapedBody(damaged);
  expect(out).toContain('<a href="https://example.com/blog/post"');
  expect(out).toContain("<h2>1. Rendering</h2>");
  expect(out.includes("&lt;")).toBe(false);
});

test("escaped body: repairing twice changes nothing the second time", () => {
  const once = repairEscapedBody(damaged);
  expect(isEscapedBody(once)).toBe(false);
});

test("escaped body: a healthy post is not matched", () => {
  const healthy = "<p>Angle brackets, &lt; and &gt;, in prose.</p><h2>Fine</h2>";
  expect(isEscapedBody(healthy)).toBe(false);
});

test("escaped body: a post that quotes HTML in a code sample is not matched", () => {
  const tutorial = "<p>Wrap it:</p><pre><code>&lt;p&gt;hello&lt;/p&gt;</code></pre>";
  expect(isEscapedBody(tutorial)).toBe(false);
});

test("escaped body: a body mixing real markup with escaped text is left to a human", () => {
  const mixed = "<h2>Real heading</h2><p>&lt;p&gt;escaped&lt;/p&gt;</p>";
  expect(isEscapedBody(mixed)).toBe(true);
  expect(unexpectedTags(mixed)).toEqual(["h2"]);
});

test("escaped body: wrappers alone are not flagged as unexpected", () => {
  expect(unexpectedTags(damaged)).toEqual([]);
});

test("escaped body: a doubly-escaped ampersand stays an ampersand", () => {
  // `&amp;lt;` is a body that really does display "&lt;" — one round of
  // unescaping must leave it as text, not turn it into a tag.
  const out = repairEscapedBody("<p>&lt;p&gt;a &amp;amp;lt; b&lt;/p&gt;</p>");
  expect(out).toContain("&amp;lt;");
  expect(out.includes("<lt;")).toBe(false);
});

test("escaped body: the repair still goes through the sanitizer", () => {
  const hostile = "<p>&lt;p&gt;hi&lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;</p>";
  const out = repairEscapedBody(hostile);
  expect(out.includes("<script")).toBe(false);
  expect(out.includes("alert(1)")).toBe(false);
  expect(out).toContain("<p>hi</p>");
});
