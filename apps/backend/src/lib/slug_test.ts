// SPDX-License-Identifier: AGPL-3.0-or-later
import { assertEquals } from "@std/assert";
import { slugify } from "@/lib/slug.ts";

// A slug is now the whole address of a post (`/@author/<slug>`), not decoration
// in front of an id, so what this function returns is what gets shared, indexed
// and linked to. It also has to agree byte-for-byte with the frontend's copy in
// apps/frontend/src/lib/links.ts.

Deno.test("slugify: kebab-cases a plain title", () => {
  assertEquals(slugify("Hello World"), "hello-world");
  assertEquals(slugify("  Spaced   out  "), "spaced-out");
});

Deno.test("slugify: keeps Azerbaijani and Turkish words readable", () => {
  // The bug this exists for: every non-ASCII letter used to become a dash, so
  // this title slugified to "cok-yoruldum-patron-daga-dasa-s-rz-nisl-r".
  assertEquals(
    slugify("Çox yoruldum patron, dağa daşa sözünüzü nişanlar"),
    "cox-yoruldum-patron-daga-dasa-sozunuzu-nisanlar",
  );
  assertEquals(slugify("Ə ə ı ğ ö ü ş ç"), "e-e-i-g-o-u-s-c");
  assertEquals(slugify("İstanbul'da bir gün"), "istanbulda-bir-gun");
});

Deno.test("slugify: transliterates Latin letters NFKD cannot decompose", () => {
  assertEquals(slugify("Straße"), "strasse");
  assertEquals(slugify("Ærø"), "aero");
});

Deno.test("slugify: drops apostrophes rather than breaking the word", () => {
  assertEquals(slugify("It's a Trap"), "its-a-trap");
  assertEquals(slugify("It’s a Trap"), "its-a-trap");
});

Deno.test("slugify: yields empty for a title with nothing to romanize", () => {
  // Not a failure — the caller falls back to the post's short id, which is a
  // working URL. Non-Latin scripts are deliberately not transliterated.
  assertEquals(slugify("Привет мир"), "");
  assertEquals(slugify("!!!"), "");
});

Deno.test("slugify: caps length without leaving a trailing dash", () => {
  const slug = slugify("word ".repeat(40));
  assertEquals(slug.length <= 80, true);
  assertEquals(slug.endsWith("-"), false);
});
