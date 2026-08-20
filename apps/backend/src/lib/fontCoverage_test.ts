// SPDX-License-Identifier: AGPL-3.0-or-later
import { assert, assertThrows } from "@std/assert";
import { coveredCodepoints } from "@/lib/fontCoverage.ts";

// Asserted against the font actually bundled, not a fixture, because the point
// of reading `cmap` at all is that the answer follows the file in assets/. A
// fixture would pass while the shipped card renders blank.
//
// The specific characters matter: the share card's fallback hangs on this
// answer being right in both directions. A false "covered" draws an empty
// rectangle and calls it a share image; a false "not covered" throws away a
// perfectly drawable title and shows the brand tile instead.

const font = await Deno.readFile(
  new URL("../../assets/fonts/Inter-SemiBold.ttf", import.meta.url),
);
const covered = coveredCodepoints(font);

function has(text: string): boolean {
  return [...text].every((ch) => covered.has(ch.codePointAt(0)!));
}

Deno.test("the bundled face covers the scripts the card claims to set", async (t) => {
  await t.step("Latin, and the accents an English-only list would miss", () => {
    // Azerbaijani and Turkish are the reason this is not just ASCII: the
    // dotless ı, the schwa, and the cedillas are ordinary letters there.
    assert(has("Şəhərin işıqları söndükdə"), "Azerbaijani");
    assert(has("İstanbul'da yağmur yağıyor"), "Turkish");
    assert(has("Tiếng Việt có dấu"), "Vietnamese");
    assert(has("Ærø, Åland, Œuvre, Straße"), "Nordic and German");
  });

  await t.step("Greek and Cyrillic", () => {
    assert(has("Δοκιμή κειμένου"), "Greek");
    assert(has("Проверка текста"), "Cyrillic");
  });

  await t.step("the punctuation a title is written with", () => {
    assert(has("“quotes” — dashes … 2026 №1 €5 ½"));
  });
});

Deno.test("what it cannot set is reported as such", () => {
  // Each of these renders as a blank advance rather than an error, which is why
  // the card asks first instead of rendering and hoping.
  assert(!has("日本語"), "Japanese");
  assert(!has("한국어"), "Korean");
  assert(!has("العربية"), "Arabic");
  assert(!has("עברית"), "Hebrew");
  assert(!has("🚀"), "emoji");
});

Deno.test("a file that is not a font is an error, never empty coverage", () => {
  // Empty coverage would silently turn every card into the brand tile, and the
  // instance would look like it had simply chosen not to draw any.
  assertThrows(() => coveredCodepoints(new Uint8Array(64)));
});
