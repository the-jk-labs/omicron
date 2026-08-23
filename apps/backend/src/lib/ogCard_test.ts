// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
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

test("a card is a JPEG at the size every platform documents", async () => {
  const card = await renderOgCard(TEXT);
  expect(card, "no card was drawn").not.toBeNull();
  // SOI + the first marker: what a scraper sniffs for.
  expect([card![0], card![1], card![2]]).toEqual([0xff, 0xd8, 0xff]);
  expect(jpegSize(card!)).toEqual({ width: 1200, height: 630 });
  expect(card!.length, `card was ${card!.length} bytes`).toBeLessThan(600 * 1024);
});

describe("a title the bundled face cannot set draws no card at all", () => {
  // The alternative is what this replaced: a correctly sized, entirely black
  // JPEG, which no part of the pipeline can tell from a real card.
  test("a script with no glyphs", async () => {
    expect(await renderOgCard({ ...TEXT, title: "日本語のタイトル" })).toBe(null);
  });

  test("a title that is only emoji", async () => {
    // Stripped before measuring, so nothing is left to draw.
    expect(await renderOgCard({ ...TEXT, title: "🚀✨🎉" })).toBe(null);
  });

  test("a title that is only whitespace", async () => {
    expect(await renderOgCard({ ...TEXT, title: "   \n\t " })).toBe(null);
  });
});

const drawn = async (text: Parameters<typeof renderOgCard>[0]) => {
  const card = await renderOgCard(text);
  expect(card, "no card was drawn").not.toBeNull();
  return card!;
};

describe("what surrounds the title never decides whether there is a card", () => {
  test("an author whose name the face cannot set still gets a card", async () => {
    // Their line is dropped; the title is what the card is for.
    await drawn({ ...TEXT, byline: "田中太郎" });
  });

  test("an emoji in the title costs the title nothing", async () => {
    const card = await drawn({ ...TEXT, title: "🚀 A post worth sharing" });
    // Same title once the rocket is stripped, so the same drawing — which is
    // the point: the emoji is removed, not rendered as a hole.
    expect(card.length).toBe((await drawn(TEXT)).length);
  });
});

describe("no title runs off the card", () => {
  test("a title far longer than four lines is truncated", async () => {
    const card = await renderOgCard({
      ...TEXT,
      title: "A very long title ".repeat(40),
    });
    expect(card).not.toBeNull();
    expect(jpegSize(card!)).toEqual({ width: 1200, height: 630 });
  });

  test("a single unbroken word is broken where it lands", async () => {
    // No word wrap can help here, and left alone it would print off the edge.
    const card = await renderOgCard({ ...TEXT, title: "x".repeat(300) });
    expect(card).not.toBeNull();
    expect(jpegSize(card!)).toEqual({ width: 1200, height: 630 });
  });

  test("an absurd title is bounded, not measured to the end", async () => {
    // Nothing limits a title's length anywhere else in the app, and every
    // measurement crosses the wasm boundary — so an unbounded layout is a
    // scraper (and the request handler behind it) held for as long as someone
    // cares to make the title. The budget is deliberately loose: what it
    // catches is quadratic work, which on this input runs into minutes.
    const started = Date.now();
    const card = await renderOgCard({ ...TEXT, title: "z".repeat(20_000) });
    expect(card).not.toBeNull();
    const elapsed = Date.now() - started;
    expect(elapsed, `layout took ${elapsed}ms`).toBeLessThan(10_000);
  });
});
