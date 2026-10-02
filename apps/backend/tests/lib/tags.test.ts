// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { MAX_TAG_LENGTH, normalizeTag, normalizeTags } from "@/lib/tags.ts";

// Tag slugs drive uniqueness, URLs and matching, and are federated as Hashtags.
// Inconsistent normalization means duplicate tags and broken tag pages.

test("normalizeTag: strips leading #, lowercases", () => {
  expect(normalizeTag("#Hello")).toBe("hello");
  expect(normalizeTag("###Deno")).toBe("deno");
});

test("normalizeTag: drops whitespace and punctuation", () => {
  expect(normalizeTag("Hello, World!")).toBe("helloworld");
  expect(normalizeTag("  ")).toBe("");
  expect(normalizeTag("🎉party🎉")).toBe("party");
});

test("normalizeTag: keeps unicode letters and digits and underscore", () => {
  expect(normalizeTag("café")).toBe("café");
  expect(normalizeTag("web_3")).toBe("web_3");
});

test("normalizeTag: spells out a symbol that is part of the name", () => {
  // Without this these collapse onto `c`/`f` — a different, unrelated tag.
  expect(normalizeTag("c++")).toBe("cpp");
  expect(normalizeTag("#C++")).toBe("cpp");
  expect(normalizeTag("notepad++")).toBe("notepadpp");
  expect(normalizeTag("c#")).toBe("csharp");
  expect(normalizeTag("F#")).toBe("fsharp");
});

test("normalizeTag: a detached symbol still normalizes away", () => {
  expect(normalizeTag("+")).toBe("");
  expect(normalizeTag("+rust")).toBe("rust");
  expect(normalizeTag("go + rust")).toBe("gorust");
});

test("normalizeTag: caps length", () => {
  expect(normalizeTag("a".repeat(80)).length).toBe(MAX_TAG_LENGTH);
});

test("normalizeTags: dedupes case-insensitively, keeps first-seen order", () => {
  expect(normalizeTags(["#JS", "js", "JS ", "Go"])).toEqual(["js", "go"]);
});

test("normalizeTags: drops entries that normalize to empty", () => {
  expect(normalizeTags(["  ", "#", "!!!", "ok"])).toEqual(["ok"]);
  expect(normalizeTags([])).toEqual([]);
});
