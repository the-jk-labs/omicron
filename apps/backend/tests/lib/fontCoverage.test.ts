import { readFileSync } from "node:fs";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import { coveredCodepoints } from "@/lib/fontCoverage.ts";

// Asserted against the font actually bundled, not a fixture, because the point
// of reading `cmap` at all is that the answer follows the file in assets/. A
// fixture would pass while the shipped card renders blank.
//
// The specific characters matter: the share card's fallback hangs on this
// answer being right in both directions. A false "covered" draws an empty
// rectangle and calls it a share image; a false "not covered" throws away a
// perfectly drawable title and shows the brand tile instead.

const font = new Uint8Array(readFileSync(new URL("../../assets/fonts/Inter-SemiBold.ttf", import.meta.url)));
const covered = coveredCodepoints(font);

function has(text: string): boolean {
  // Iterate by code point (a `for…of` over a string yields whole code points,
  // surrogate pairs included) so an astral character is one cmap lookup, not two
  // half-surrogate ones.
  for (const ch of text) {
    if (!covered.has(ch.codePointAt(0)!)) return false;
  }
  return true;
}

describe("the bundled face covers the scripts the card claims to set", () => {
  test("Latin, and the accents an English-only list would miss", () => {
    // Azerbaijani and Turkish are the reason this is not just ASCII: the
    // dotless ı, the schwa, and the cedillas are ordinary letters there.
    expect(has("Şəhərin işıqları söndükdə"), "Azerbaijani").toBe(true);
    expect(has("İstanbul'da yağmur yağıyor"), "Turkish").toBe(true);
    expect(has("Tiếng Việt có dấu"), "Vietnamese").toBe(true);
    expect(has("Ærø, Åland, Œuvre, Straße"), "Nordic and German").toBe(true);
  });

  test("Greek and Cyrillic", () => {
    expect(has("Δοκιμή κειμένου"), "Greek").toBe(true);
    expect(has("Проверка текста"), "Cyrillic").toBe(true);
  });

  test("the punctuation a title is written with", () => {
    expect(has("“quotes” — dashes … 2026 №1 €5 ½")).toBe(true);
  });
});

test("what it cannot set is reported as such", () => {
  // Each of these renders as a blank advance rather than an error, which is why
  // the card asks first instead of rendering and hoping.
  expect(has("日本語"), "Japanese").toBe(false);
  expect(has("한국어"), "Korean").toBe(false);
  expect(has("العربية"), "Arabic").toBe(false);
  expect(has("עברית"), "Hebrew").toBe(false);
  expect(has("🚀"), "emoji").toBe(false);
});

test("an astral-plane character is one lookup, not two half-surrogate ones", () => {
  // U+1F680 is above the BMP, so it is a surrogate pair in UTF-16. Iterating by
  // code unit would ask the cmap about the halves (0xD83D, 0xDE80) — two glyphs
  // the face may well have — and could answer "covered" for a rocket it cannot
  // draw. The code-point walk in `has` is what keeps this honest.
  const rocket = String.fromCodePoint(0x1f680);
  expect(Array.from(rocket)).toHaveLength(1);
  expect(has(rocket), "rocket").toBe(false);
  expect(covered.has(0xd83d), "high surrogate").toBe(false);
  expect(covered.has(0xde80), "low surrogate").toBe(false);
});

test("a file that is not a font is an error, never empty coverage", () => {
  // Empty coverage would silently turn every card into the brand tile, and the
  // instance would look like it had simply chosen not to draw any.
  expect(() => coveredCodepoints(new Uint8Array(64))).toThrow(/font/i);
});
