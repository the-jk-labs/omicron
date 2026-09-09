// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFile } from "node:fs/promises";
import {
  Drawables,
  Gravity,
  ImageMagick,
  Magick,
  MagickColor,
  MagickFormat,
  MagickImage,
  Point,
} from "@imagemagick/magick-wasm";
import { coveredCodepoints } from "@/lib/fontCoverage.ts";
import { initializeMagick } from "@/lib/magick.ts";

// The share card drawn for a profile page, in the Substack spirit: who this is,
// not just that somebody exists here. Avatar on the left, name, handle, bio and
// a stats line on the right — so a shared profile link says something about the
// person behind it instead of showing the same brand tile as every other page.
//
// Same visual language as the post card (lib/ogCard.ts): the same 1200x630
// canvas, the same near-black ground, the same short white rule, the same face.
// Two cards from one instance read as coming from the same place, whether the
// link points at an article or at its author.
//
// Deliberately free of config, database and filesystem concerns — like
// lib/ogCard.ts, whose caching lives in services/. This module takes plain
// values plus optional avatar bytes and returns JPEG bytes, which is what makes
// the layout testable.

// The size every platform documents for a large summary card.
const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 88;

// The vertical band the content lives in. Bounded above by the accent bar and
// below by the site line, mirroring the post card so the two align side by side
// in a timeline.
const BAND_TOP = 132;
const BAND_BOTTOM = 476;
const SITE_BASELINE = 578;

// The avatar is a square, cover-cropped: a banner is the author's composition,
// but an avatar is an identity marker, and letterboxing it would shrink the
// face it exists to show. Rounded-square fallback (not a circle): the wasm
// build exposes no circle primitive, and a square photo beside a circle
// fallback would read as two different designs.
const AVATAR = 232;
const AVATAR_X = PAD;
const AVATAR_RADIUS = 48;
const AVATAR_FALLBACK_BG = "#27272a";

// The text column starts right of the avatar.
const TEXT_X = PAD + AVATAR + 48;
const TEXT_W = WIDTH - PAD - TEXT_X;

// Tried largest-first: a short name gets to be big, a long one shrinks rather
// than overflowing. Two lines at most — a name is not a paragraph.
const NAME_SIZES = [64, 58, 52, 46];
const MAX_NAME_LINES = 2;
const NAME_LINE_HEIGHT = 1.16;
const HANDLE_SIZE = 28;
const BIO_SIZE = 30;
const BIO_LINE_HEIGHT = 1.35;
const MAX_BIO_LINES = 3;
const STATS_SIZE = 26;
const SITE_SIZE = 26;

const BACKGROUND = "#0a0a0a";
const NAME_COLOR = "#ffffff";
const BIO_COLOR = "#e4e4e7";
const DIM_COLOR = "#71717a";

// Comfortably under WhatsApp's ~600KB ceiling; flat colour and text compress
// far better than a photograph, so this lands well under it even with a face on
// it.
const QUALITY = 85;

// The one face the card is drawn in, registered with ImageMagick under this
// name. See assets/fonts/README.md for what it is and where it came from.
const FONT = "omicron-og-card";
const FONT_PATH = new URL("../../assets/fonts/Inter-SemiBold.ttf", import.meta.url);

// Emoji and other pictographs are stripped before anything is measured. The
// bundled face has no glyphs for them, and ImageMagick answers a missing glyph
// with a blank advance rather than an error — so left in they punch holes in
// the words. A bio minus its decorations is still the bio; a bio with gaps
// where the rocket was is not.
const PICTOGRAPHS = /[\p{Extended_Pictographic}\p{Emoji_Presentation}️‍]/gu;

// More characters than the bio block could ever show, with room to spare. A bio
// has a length limit of its own, but bounding the layout input here keeps one
// pathological profile from holding a scraper while every measurement crosses
// the wasm boundary.
const MAX_BIO_CHARS = 220;
const MAX_NAME_CHARS = 80;

let fontReady: Promise<Set<number>> | null = null;

/** Registers the card font once and returns what it can draw. */
function loadFont(): Promise<Set<number>> {
  if (!fontReady) {
    fontReady = (async () => {
      await initializeMagick();
      const font = await readFile(FONT_PATH);
      try {
        Magick.addFont(FONT, font);
      } catch {
        // Already registered by the post card in this process — same face,
        // same name. Registration is the only part that can collide; the
        // coverage set below is derived from the file bytes either way.
      }
      return coveredCodepoints(font);
    })().catch((err) => {
      fontReady = null;
      throw err;
    });
  }
  return fontReady;
}

function clean(text: string): string {
  return text.replace(PICTOGRAPHS, " ").replace(/\s+/g, " ").trim();
}

function drawable(size: number): Drawables {
  return new Drawables().font(FONT).fontPointSize(size);
}

function widthOf(text: string, size: number): number {
  // A failed measurement must not wrap everything onto one overflowing line;
  // half the point size per character is a deliberate over-estimate, so the
  // degraded case breaks early rather than running off the card.
  return drawable(size).fontTypeMetrics(text)?.textWidth ?? text.length * size * 0.5;
}

function ascentOf(text: string, size: number): number {
  return drawable(size).fontTypeMetrics(text)?.ascent ?? size * 0.8;
}

/** Greedy word wrap, breaking inside a word only when the word alone overflows. */
function wrap(text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  const push = () => {
    if (line) lines.push(line);
    line = "";
  };

  for (const word of text.split(" ")) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && widthOf(candidate, size) > width) {
      push();
      line = word;
    } else {
      line = candidate;
    }
    // An unbroken run of characters can be wider than the column on its own,
    // and no amount of word wrapping helps — break it where it lands. Binary
    // search rather than a walk back from the end: each probe is a measurement
    // through the wasm boundary.
    while (widthOf(line, size) > width && line.length > 1) {
      let low = 1;
      let high = line.length - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (widthOf(line.slice(0, mid), size) > width) high = mid - 1;
        else low = mid;
      }
      lines.push(line.slice(0, low));
      line = line.slice(low);
    }
  }
  push();
  return lines;
}

/** A single line that fits the width, truncated with an ellipsis when it cannot. */
function singleLine(text: string, size: number, width: number): string {
  if (widthOf(text, size) <= width) return text;
  let out = text;
  while (out.length > 1 && widthOf(`${out}…`, size) > width) out = out.slice(0, -1);
  return `${out.replace(/[\s.,;:—–-]+$/, "")}…`;
}

export type ProfileCardText = {
  /** The display name. Decides whether a card is drawn at all. */
  displayName: string;
  /** The short handle, e.g. `@alice`. */
  handle: string;
  /** The bio, shown when it survives cleaning. */
  bio: string;
  /** The stats line, e.g. `12 articles · 340 followers`. Already formatted. */
  stats: string;
  /** The instance this profile lives on. */
  site: string;
};

/** The initials the UI shows when a profile has no avatar (mirrors Avatar.svelte). */
export function profileInitials(displayName: string): string {
  return (
    displayName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/**
 * A profile's share card as JPEG bytes, or null when the name cannot be drawn.
 *
 * Null is a real answer rather than an error: the bundled face covers Latin,
 * Greek and Cyrillic, so a name written in Japanese, Korean or Arabic would
 * render as an empty rectangle. The caller falls back to the instance's brand
 * image, which says less but at least says something.
 *
 * The bio is dropped on the same test. It is context around the name, and a
 * blank block is worse than no block. The handle, stats and site lines are
 * generated ASCII and always drawn.
 */
export async function renderProfileCard(
  text: ProfileCardText,
  avatarBytes?: Uint8Array | null,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const covered = await loadFont();
  // A string this font can draw in full, or null. Whitespace is exempt: it is
  // not a glyph anyone misses.
  const renderable = (value: string) => {
    const cleaned = clean(value);
    if (!cleaned) return null;
    for (const ch of cleaned) {
      if (ch !== " " && !covered.has(ch.codePointAt(0)!)) return null;
    }
    return cleaned;
  };

  const displayName = renderable(text.displayName)?.slice(0, MAX_NAME_CHARS);
  if (!displayName) return null;
  const bio = renderable(text.bio)?.slice(0, MAX_BIO_CHARS);
  const site = renderable(text.site);
  const handle = clean(text.handle).slice(0, 64) || "@user";
  const stats = clean(text.stats).slice(0, 64);

  // The largest name size that fits two lines.
  let nameLines: string[] = [];
  let nameSize = NAME_SIZES[NAME_SIZES.length - 1];
  for (const size of NAME_SIZES) {
    const lines = wrap(displayName, size, TEXT_W);
    if (lines.length <= MAX_NAME_LINES) {
      nameLines = lines;
      nameSize = size;
      break;
    }
  }
  if (nameLines.length === 0) {
    nameLines = wrap(displayName, nameSize, TEXT_W).slice(0, MAX_NAME_LINES);
    const last = nameLines.length - 1;
    nameLines[last] = `${nameLines[last].replace(/[\s.,;:—–-]+$/, "")}…`;
  }
  const nameLineHeight = Math.round(nameSize * NAME_LINE_HEIGHT);

  const handleLine = singleLine(handle, HANDLE_SIZE, TEXT_W);
  const bioLines = bio ? wrap(bio, BIO_SIZE, TEXT_W).slice(0, MAX_BIO_LINES) : [];
  if (bioLines.length === MAX_BIO_LINES) {
    const last = bioLines.length - 1;
    if (wrap(bio!, BIO_SIZE, TEXT_W).length > MAX_BIO_LINES) {
      bioLines[last] = `${bioLines[last].replace(/[\s.,;:—–-]+$/, "")}…`;
    }
  }
  const bioLineHeight = Math.round(BIO_SIZE * BIO_LINE_HEIGHT);

  const GAP_NAME_HANDLE = 10;
  const GAP_HANDLE_BIO = bioLines.length ? 16 : 0;
  const GAP_BIO_STATS = 18;
  const blockHeight =
    nameLines.length * nameLineHeight +
    GAP_NAME_HANDLE +
    Math.round(HANDLE_SIZE * 1.2) +
    GAP_HANDLE_BIO +
    bioLines.length * bioLineHeight +
    GAP_BIO_STATS +
    Math.round(STATS_SIZE * 1.2);
  const band = BAND_BOTTOM - BAND_TOP;
  const blockTop = BAND_TOP + Math.max(0, (band - blockHeight) / 2);

  const image = MagickImage.create();
  image.read(new MagickColor(BACKGROUND), WIDTH, HEIGHT);

  // The avatar first, so the text draws over nothing it needs.
  const avatarY = Math.round(BAND_TOP + (band - AVATAR) / 2);
  let avatarDrawn = false;
  if (avatarBytes?.byteLength) {
    try {
      ImageMagick.read(avatarBytes, (avatar) => {
        avatar.strip();
        if (avatar.width <= 0 || avatar.height <= 0) throw new Error("Empty avatar.");
        // Cover-crop to the square: scale so the short side lands on it, then
        // cut the long side around the centre.
        const scale = AVATAR / Math.min(avatar.width, avatar.height);
        const w = Math.max(AVATAR, Math.round(avatar.width * scale));
        const h = Math.max(AVATAR, Math.round(avatar.height * scale));
        if (w !== avatar.width || h !== avatar.height) avatar.resize(w, h);
        if (w !== AVATAR || h !== AVATAR) avatar.extent(AVATAR, AVATAR, Gravity.Center);
        image.composite(avatar, new Point(AVATAR_X, avatarY));
      });
      avatarDrawn = true;
    } catch {
      // A corrupt or exotic avatar must not cost the caller their card — the
      // initials fallback below covers it.
    }
  }

  const draw = new Drawables();
  // A short white rule, the card's only ornament — the same one the post card
  // carries, so the two are recognisable as coming from the same place.
  draw.fillColor(new MagickColor(NAME_COLOR)).rectangle(PAD, 74, PAD + 56, 80);

  if (!avatarDrawn) {
    draw
      .fillColor(new MagickColor(AVATAR_FALLBACK_BG))
      .roundRectangle(AVATAR_X, avatarY, AVATAR_X + AVATAR, avatarY + AVATAR, AVATAR_RADIUS, AVATAR_RADIUS);
  }
  draw.draw(image);

  if (!avatarDrawn) {
    // The initials sit centred in the fallback tile. Measured rather than
    // gravity-placed: the tile's position on the canvas is known exactly.
    const initials = profileInitials(displayName);
    const initialSize = 84;
    const iw = widthOf(initials, initialSize);
    const ascent = ascentOf(initials || "M", initialSize);
    const ix = Math.round(AVATAR_X + (AVATAR - iw) / 2);
    const iy = Math.round(avatarY + AVATAR / 2 + ascent / 2 - 6);
    const fg = new Drawables();
    fg.font(FONT).fontPointSize(initialSize).fillColor(new MagickColor(NAME_COLOR)).text(ix, iy, initials);
    fg.draw(image);
  }

  // The text column, stacked from the block top.
  const ink = new Drawables();
  ink.font(FONT);
  let y = Math.round(blockTop + ascentOf(nameLines[0], nameSize));
  ink.fontPointSize(nameSize).fillColor(new MagickColor(NAME_COLOR));
  nameLines.forEach((line, i) => ink.text(TEXT_X, y + i * nameLineHeight, line));
  y += (nameLines.length - 1) * nameLineHeight + GAP_NAME_HANDLE + Math.round(HANDLE_SIZE * 1.2);
  ink.fontPointSize(HANDLE_SIZE).fillColor(new MagickColor(DIM_COLOR)).text(TEXT_X, y, handleLine);
  if (bioLines.length) {
    y += GAP_HANDLE_BIO;
    ink.fontPointSize(BIO_SIZE).fillColor(new MagickColor(BIO_COLOR));
    bioLines.forEach((line, i) => {
      const baseline = y + ascentOf(line, BIO_SIZE) + i * bioLineHeight;
      ink.text(TEXT_X, Math.round(baseline), line);
    });
    y += (bioLines.length - 1) * bioLineHeight + ascentOf(bioLines[bioLines.length - 1], BIO_SIZE);
  }
  y += GAP_BIO_STATS + Math.round(STATS_SIZE * 0.9);
  ink.fontPointSize(STATS_SIZE).fillColor(new MagickColor(DIM_COLOR)).text(TEXT_X, Math.round(y), stats);

  if (site) {
    ink.fontPointSize(SITE_SIZE).fillColor(new MagickColor(DIM_COLOR)).text(PAD, SITE_BASELINE, site);
  }
  ink.draw(image);

  image.quality = QUALITY;
  let out: Uint8Array<ArrayBuffer> | null = null;
  // Copied out of the callback: the buffer magick hands over is only valid for
  // the duration of the call.
  image.write(MagickFormat.Jpeg, (bytes) => {
    out = new Uint8Array(bytes);
  });
  if (!out) throw new Error("Profile card could not be encoded.");
  return out;
}
