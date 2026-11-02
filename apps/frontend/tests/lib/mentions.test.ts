// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import { activeMention, insertMention, mergeSuggestions, splitMentions, stillAddressed } from "#lib/mentions.js";

describe("splitMentions", () => {
  test("splits plain runs from local and remote mentions", () => {
    expect(splitMentions("hi @ada and @bob@mastodon.social!")).toEqual([
      { start: 0, text: "hi " },
      { start: 3, text: "@ada", mention: "ada" },
      { start: 7, text: " and " },
      { start: 12, text: "@bob@mastodon.social", mention: "bob@mastodon.social" },
      { start: 32, text: "!" },
    ]);
  });

  test.for(["mail me@ada.dev", "a@ada", "@", "@@ada", `@${"a".repeat(31)}`])("%j has no mention", (text) => {
    expect(splitMentions(text).some((s) => s.mention)).toBe(false);
  });

  test("an empty text has no segments", () => {
    expect(splitMentions("")).toEqual([]);
  });
});

describe("activeMention", () => {
  test("finds the handle being typed at the caret", () => {
    expect(activeMention("hi @ad", 6)).toEqual({ start: 3, end: 6, query: "ad" });
    expect(activeMention("@", 1)).toEqual({ start: 0, end: 1, query: "" });
  });

  test("covers the rest of the word after the caret", () => {
    expect(activeMention("hi @adxyz later", 6)).toEqual({ start: 3, end: 9, query: "ad" });
  });

  test.for([
    ["hi ada", 6],
    ["me@ad", 5],
    ["@ada done", 9],
  ] as const)("%j at %i is not a mention", ([text, caret]) => {
    expect(activeMention(text, caret)).toBe(null);
  });
});

describe("insertMention", () => {
  test("replaces the query with the handle and a space, caret after it", () => {
    const text = "hi @ad";
    expect(insertMention(text, activeMention(text, 6)!, "ada")).toEqual({ text: "hi @ada ", caret: 8 });
  });

  test("keeps what follows without doubling the space", () => {
    const text = "hi @a there";
    expect(insertMention(text, activeMention(text, 5)!, "ada")).toEqual({ text: "hi @ada there", caret: 8 });
  });
});

describe("stillAddressed", () => {
  test.for([
    ["@ada ", true],
    ["@ada", true],
    ["@Ada hello", true],
    ["@adam hi", false],
    ["hello", false],
    ["", false],
  ] as const)("%j → %s", ([text, expected]) => {
    expect(stillAddressed(text, "ada")).toBe(expected);
  });
});

const p = (username: string) => ({ username });

describe("mergeSuggestions", () => {
  test("participants matching the query come first, then results, without repeats", () => {
    expect(mergeSuggestions("a", [p("ada"), p("bob"), p("amy")], [p("ADA"), p("alan")])).toEqual([
      p("ada"),
      p("amy"),
      p("alan"),
    ]);
  });

  test("stops at the limit", () => {
    expect(mergeSuggestions("", [p("a1"), p("a2")], [p("a3")], 2)).toHaveLength(2);
  });
});
