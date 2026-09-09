// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import { profileInitials, renderProfileCard } from "@/lib/profileCard.ts";

// What is asserted here is the promise the card makes to a link-preview
// scraper, not ImageMagick's behaviour: a JPEG of the documented size, small
// enough for the platforms that consume it, and — the part that matters most —
// nothing at all rather than a blank rectangle when the name cannot be set.
//
// The layout itself cannot be asserted on without comparing pixels, which would
// fail on any harmless change to the design. What can be asserted is that no
// input silently produces an empty card, which is the failure that would ship
// unnoticed: an empty card is a valid JPEG of exactly the right dimensions.

const TEXT = {
  displayName: "Ada Lovelace",
  handle: "@ada",
  bio: "Mathematician writing about analytical engines and early computing.",
  stats: "12 articles · 340 followers",
  site: "blog.example.test",
};

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

test("a profile card is a JPEG at the size every platform documents", async () => {
  const card = await renderProfileCard(TEXT);
  expect(card, "no card was drawn").not.toBeNull();
  // SOI + the first marker: what a scraper sniffs for.
  expect([card![0], card![1], card![2]]).toEqual([0xff, 0xd8, 0xff]);
  expect(jpegSize(card!)).toEqual({ width: 1200, height: 630 });
  expect(card!.length, `card was ${card!.length} bytes`).toBeLessThan(600 * 1024);
});

test("a profile without a bio still gets a card", async () => {
  const card = await renderProfileCard({ ...TEXT, bio: "" });
  expect(card, "no card was drawn").not.toBeNull();
  expect(jpegSize(card!)).toEqual({ width: 1200, height: 630 });
});

test("a corrupt avatar falls back to initials rather than failing the card", async () => {
  const card = await renderProfileCard(TEXT, new Uint8Array([0, 1, 2, 3, 4]));
  expect(card, "no card was drawn").not.toBeNull();
  expect(jpegSize(card!)).toEqual({ width: 1200, height: 630 });
});

describe("a name the bundled face cannot set draws no card at all", () => {
  test("a script with no glyphs", async () => {
    expect(await renderProfileCard({ ...TEXT, displayName: "田中太郎" })).toBe(null);
  });

  test("a name that is only emoji", async () => {
    expect(await renderProfileCard({ ...TEXT, displayName: "🚀✨🎉" })).toBe(null);
  });
});

describe("what surrounds the name never decides whether there is a card", () => {
  test("a bio the face cannot set still gets a card", async () => {
    const card = await renderProfileCard({ ...TEXT, bio: "日本語の自己紹介文です" });
    expect(card, "no card was drawn").not.toBeNull();
  });

  test("an emoji in the name costs the name nothing", async () => {
    const card = await renderProfileCard({ ...TEXT, displayName: "🚀 Ada Lovelace" });
    expect(card, "no card was drawn").not.toBeNull();
    expect(jpegSize(card!)).toEqual({ width: 1200, height: 630 });
  });
});

describe("no text runs off the card", () => {
  test("a very long bio is bounded", async () => {
    const card = await renderProfileCard({ ...TEXT, bio: "Writing about engines. ".repeat(40) });
    expect(card).not.toBeNull();
    expect(jpegSize(card!)).toEqual({ width: 1200, height: 630 });
  });

  test("a very long display name is bounded", async () => {
    const card = await renderProfileCard({
      ...TEXT,
      displayName: "Alexandria Cassiopeia Maximiliana Worthington-Smythe the Third",
    });
    expect(card).not.toBeNull();
    expect(jpegSize(card!)).toEqual({ width: 1200, height: 630 });
  });
});

describe("profileInitials", () => {
  test("takes the first letters of the first two words", () => {
    expect(profileInitials("Ada Lovelace")).toBe("AL");
    expect(profileInitials("  ada   ")).toBe("A");
    expect(profileInitials("")).toBe("?");
  });
});
