// SPDX-License-Identifier: AGPL-3.0-or-later
import { assertEquals } from "@std/assert";
import { MAX_TAG_LENGTH, normalizeTag, normalizeTags } from "@/lib/tags.ts";

// Tag slugs drive uniqueness, URLs and matching, and are federated as Hashtags.
// Inconsistent normalization means duplicate tags and broken tag pages.

Deno.test("normalizeTag: strips leading #, lowercases", () => {
  assertEquals(normalizeTag("#Hello"), "hello");
  assertEquals(normalizeTag("###Deno"), "deno");
});

Deno.test("normalizeTag: drops whitespace and punctuation", () => {
  assertEquals(normalizeTag("Hello, World!"), "helloworld");
  assertEquals(normalizeTag("  "), "");
  assertEquals(normalizeTag("🎉party🎉"), "party");
});

Deno.test("normalizeTag: keeps unicode letters and digits and underscore", () => {
  assertEquals(normalizeTag("café"), "café");
  assertEquals(normalizeTag("web_3"), "web_3");
});

Deno.test("normalizeTag: caps length", () => {
  assertEquals(normalizeTag("a".repeat(80)).length, MAX_TAG_LENGTH);
});

Deno.test("normalizeTags: dedupes case-insensitively, keeps first-seen order", () => {
  assertEquals(normalizeTags(["#JS", "js", "JS ", "Go"]), ["js", "go"]);
});

Deno.test("normalizeTags: drops entries that normalize to empty", () => {
  assertEquals(normalizeTags(["  ", "#", "!!!", "ok"]), ["ok"]);
  assertEquals(normalizeTags([]), []);
});
