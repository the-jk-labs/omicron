// SPDX-License-Identifier: AGPL-3.0-or-later
import { assert, assertEquals } from "@std/assert";
import { renderOgCard } from "@/lib/ogCard.ts";

// What is asserted here is the promise the card makes to a link-preview
// scraper, not ImageMagick's behaviour: a JPEG of the documented size, small
// enough for the platforms that consume it, and — the part that matters most —
// nothing at all rather than a blank rectangle when the title cannot be set.
//
// The layout itself cannot be asserted on without comparing pixels, which would
// fail on any harmless change to the design. What can be asserted is that no
// input silently produces an empty card, which is the failure that would ship
// unnoticed: an empty card is a valid JPEG of exactly the right dimensions.

const TEXT = { title: "A post worth sharing", byline: "Alice", site: "blog.example.test" };

/** Width and height read out of a JPEG's start-of-frame marker. */
function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  for (let i = 2; i < bytes.length - 9;) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return {
        height: (bytes[i + 5] << 8) | bytes[i + 6],
        width: (bytes[i + 7] << 8) | bytes[i + 8],
      };
    }
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
  }
  return null;
}

Deno.test("a card is a JPEG at the size every platform documents", async () => {
  const card = await renderOgCard(TEXT);
  assert(card, "no card was drawn");
  // SOI + the first marker: what a scraper sniffs for.
  assertEquals([card[0], card[1], card[2]], [0xff, 0xd8, 0xff]);
  assertEquals(jpegSize(card), { width: 1200, height: 630 });
  assert(card.length < 600 * 1024, `card was ${card.length} bytes`);
});

Deno.test("a title the bundled face cannot set draws no card at all", async (t) => {
  // The alternative is what this replaced: a correctly sized, entirely black
  // JPEG, which no part of the pipeline can tell from a real card.
  await t.step("a script with no glyphs", async () => {
    assertEquals(await renderOgCard({ ...TEXT, title: "日本語のタイトル" }), null);
  });

  await t.step("a title that is only emoji", async () => {
    // Stripped before measuring, so nothing is left to draw.
    assertEquals(await renderOgCard({ ...TEXT, title: "🚀✨🎉" }), null);
  });

  await t.step("a title that is only whitespace", async () => {
    assertEquals(await renderOgCard({ ...TEXT, title: "   \n\t " }), null);
  });
});

Deno.test("what surrounds the title never decides whether there is a card", async (t) => {
  const drawn = async (text: Parameters<typeof renderOgCard>[0]) => {
    const card = await renderOgCard(text);
    assert(card, "no card was drawn");
    return card;
  };

  await t.step("an author whose name the face cannot set still gets a card", async () => {
    // Their line is dropped; the title is what the card is for.
    await drawn({ ...TEXT, byline: "田中太郎" });
  });

  await t.step("an emoji in the title costs the title nothing", async () => {
    const card = await drawn({ ...TEXT, title: "🚀 A post worth sharing" });
    // Same title once the rocket is stripped, so the same drawing — which is
    // the point: the emoji is removed, not rendered as a hole.
    assertEquals(card.length, (await drawn(TEXT)).length);
  });
});

Deno.test("no title runs off the card", async (t) => {
  await t.step("a title far longer than four lines is truncated", async () => {
    const card = await renderOgCard({
      ...TEXT,
      title: "A very long title ".repeat(40),
    });
    assert(card);
    assertEquals(jpegSize(card), { width: 1200, height: 630 });
  });

  await t.step("a single unbroken word is broken where it lands", async () => {
    // No word wrap can help here, and left alone it would print off the edge.
    const card = await renderOgCard({ ...TEXT, title: "x".repeat(300) });
    assert(card);
    assertEquals(jpegSize(card), { width: 1200, height: 630 });
  });

  await t.step("an absurd title is bounded, not measured to the end", async () => {
    // Nothing limits a title's length anywhere else in the app, and every
    // measurement crosses the wasm boundary — so an unbounded layout is a
    // scraper (and the request handler behind it) held for as long as someone
    // cares to make the title. The budget is deliberately loose: what it
    // catches is quadratic work, which on this input runs into minutes.
    const started = Date.now();
    const card = await renderOgCard({ ...TEXT, title: "z".repeat(20_000) });
    assert(card);
    const elapsed = Date.now() - started;
    assert(elapsed < 10_000, `layout took ${elapsed}ms`);
  });
});
