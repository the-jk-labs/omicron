// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { slugify } from "@/lib/slug.ts";

// A slug is now the whole address of a post (`/@author/<slug>`), not decoration
// in front of an id, so what this function returns is what gets shared, indexed
// and linked to. It also has to agree byte-for-byte with the frontend's copy in
// apps/frontend/src/lib/links.ts.

test("slugify: kebab-cases a plain title", () => {
  expect(slugify("Hello World")).toBe("hello-world");
  expect(slugify("  Spaced   out  ")).toBe("spaced-out");
});

test("slugify: keeps Azerbaijani and Turkish words readable", () => {
  // The bug this exists for: every non-ASCII letter used to become a dash, so
  // this title slugified to "cok-yoruldum-patron-daga-dasa-s-rz-nisl-r".
  expect(slugify("Çox yoruldum patron, dağa daşa sözünüzü nişanlar")).toBe(
    "cox-yoruldum-patron-daga-dasa-sozunuzu-nisanlar",
  );
  expect(slugify("Ə ə ı ğ ö ü ş ç")).toBe("e-e-i-g-o-u-s-c");
  expect(slugify("İstanbul'da bir gün")).toBe("istanbulda-bir-gun");
});

test("slugify: transliterates Latin letters NFKD cannot decompose", () => {
  expect(slugify("Straße")).toBe("strasse");
  expect(slugify("Ærø")).toBe("aero");
});

test("slugify: drops apostrophes rather than breaking the word", () => {
  expect(slugify("It's a Trap")).toBe("its-a-trap");
  expect(slugify("It’s a Trap")).toBe("its-a-trap");
});

test("slugify: yields empty for a title with nothing to romanize", () => {
  // Not a failure — the caller falls back to the post's short id, which is a
  // working URL. Non-Latin scripts are deliberately not transliterated.
  expect(slugify("Привет мир")).toBe("");
  expect(slugify("!!!")).toBe("");
});

test("slugify: caps length without leaving a trailing dash", () => {
  const slug = slugify("word ".repeat(40));
  expect(slug.length <= 80).toBe(true);
  expect(slug.endsWith("-")).toBe(false);
});
