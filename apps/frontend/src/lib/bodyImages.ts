// SPDX-License-Identifier: AGPL-3.0-or-later
// Loading hints for the images inside a rendered post body.
//
// Like highlightCodeBlocks (see $lib/highlight), this runs when a post is
// **read**, in the server load, for the same reasons: it covers every post
// already in the database without a backfill, it leaves the stored HTML as the
// author wrote it — so nothing federates differently and the editor rehydrates
// unchanged — and it lands in the HTML the reader first receives.
//
// A long article can carry a dozen images, all of them below the fold and all
// of them fetched immediately, competing with the text for bandwidth. Deferring
// them is the single cheapest thing available here, and `decoding="async"`
// keeps the decode off the main thread so a wide image cannot stall scrolling.
//
// The cover image is deliberately not handled here — it is above the fold and
// is the element page-speed scores are timed by, so it is marked high priority
// instead. See the post page.

// The trailing `/` of the sanitizer's self-closing `<img … />` is captured
// separately and dropped, so appended attributes land before it rather than
// after — `<img src="…" / loading="lazy">` is malformed, and only survives
// because parsers forgive a stray solidus.
//
// Matching `>` with `[^>]*` is safe here only because this HTML has already
// been through the sanitizer, which re-serializes every attribute quoted and
// entity-encodes any `>` inside a value (backend lib/sanitize.ts).
const IMG_TAG = /<img\b([^>]*?)\s*\/?>/gi;

// Neither attribute is in the sanitizer's img allowlist (src, alt, title,
// width, height, class, align), so a stored body never carries one and these
// always apply. The guards are kept anyway: they cost one test each, and if
// the allowlist ever grows, an author's explicit choice should win over ours
// rather than silently gaining a duplicate attribute.
export function deferBodyImages(html: string): string {
  if (!html.includes("<img")) return html;

  return html.replace(IMG_TAG, (_tag, attrs: string) => {
    let out = attrs;
    if (!/\bloading\s*=/i.test(out)) out += ' loading="lazy"';
    if (!/\bdecoding\s*=/i.test(out)) out += ' decoding="async"';
    return `<img${out} />`;
  });
}
