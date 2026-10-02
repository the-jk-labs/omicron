import { MAX_TAG_LENGTH, normalizeTag } from "$lib/tags";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";

test.for([
  ["#Deno", "deno"],
  ["##rust", "rust"],
  ["Machine Learning", "machinelearning"],
  ["c++", "cpp"],
  ["C#", "csharp"],
  ["f#", "fsharp"],
  ["node.js", "nodejs"],
  ["snake_case", "snake_case"],
  ["Azərbaycan", "azərbaycan"],
  ["日本語", "日本語"],
  ["ｆｕｌｌｗｉｄｔｈ", "fullwidth"],
  ["+++", ""],
  ["#", ""],
  ["", ""],
])("%s → %s", ([raw, slug]) => {
  expect(normalizeTag(raw)).toBe(slug);
});

test("a sign only counts as ++/# after a word character", () => {
  expect(normalizeTag("++c")).toBe("c");
  expect(normalizeTag("#c#")).toBe("csharp");
});

test("is capped at the maximum length", () => {
  expect(normalizeTag("a".repeat(80))).toHaveLength(MAX_TAG_LENGTH);
});
