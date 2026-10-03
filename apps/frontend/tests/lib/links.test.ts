// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import { listIdFromSlug, listPath, postIdFromSlug, postPath, slugify } from "#lib/links.js";

describe("slugify", () => {
  test.for([
    ["Europe is ditching Visa — and it's a huge step", "europe-is-ditching-visa-and-its-a-huge-step"],
    ["Sözün əsl mənası", "sozun-esl-menasi"],
    ["Straße & Œuvre", "strasse-oeuvre"],
    ["Ærø, Þór, łódź, ħal, ŋ, đ, ð, ı, ø", "aero-thor-lodz-hal-n-d-d-i-o"],
    ["Crème brûlée", "creme-brulee"],
    ["  --Leading and trailing--  ", "leading-and-trailing"],
    ["日本語のタイトル", ""],
    ["", ""],
  ])("%s → %s", ([title, slug]) => {
    expect(slugify(title)).toBe(slug);
  });

  test("is capped at 80 characters without a trailing dash", () => {
    const slug = slugify(`${"a".repeat(79)} b`);
    expect(slug).toBe("a".repeat(79));
    expect(slugify("word ".repeat(40)).length).toBeLessThanOrEqual(80);
    expect(slugify("word ".repeat(40))).not.toMatch(/-$/);
  });
});

describe("post paths", () => {
  test("use the server's slug, else the short id", () => {
    const author = { username: "ada" };
    expect(postPath({ id: "9e962281-aaaa", slug: "hello", author })).toBe("/@ada/hello");
    expect(postPath({ id: "9e962281-aaaa", slug: null, author })).toBe("/@ada/9e962281");
    expect(postPath({ id: "9e962281-aaaa", slug: "", author: { username: "bob@remote.example" } })).toBe(
      "/@bob@remote.example/9e962281",
    );
  });

  test.for<[string, string | null]>([
    ["9E962281-2222-3333-4444-555555555555", "9e962281-2222-3333-4444-555555555555"],
    ["old-title-9e962281-2222-3333-4444-555555555555", "9e962281-2222-3333-4444-555555555555"],
    ["some-title-9e962281", "9e962281"],
    ["9E962281", "9e962281"],
    ["title-deadbeefcafe", "deadbeefcafe"],
    ["just-a-title", null],
    ["title-9e96228", null],
    ["title-9e962281z", null],
  ])("postIdFromSlug(%s) → %s", ([slug, id]) => {
    expect(postIdFromSlug(slug)).toBe(id);
  });
});

describe("list paths", () => {
  test("title slug plus short id, or the short id alone", () => {
    expect(listPath({ id: "66635376-aaaa", title: "Weekend reads" })).toBe("/lists/weekend-reads-66635376");
    expect(listPath({ id: "66635376-aaaa", title: "日本" })).toBe("/lists/66635376");
  });

  test("ids round-trip from the slug", () => {
    expect(listIdFromSlug("weekend-reads-66635376")).toBe("66635376");
    expect(listIdFromSlug("66635376-1111-2222-3333-444444444444")).toBe("66635376-1111-2222-3333-444444444444");
    expect(listIdFromSlug("weekend-reads")).toBe(null);
  });
});
