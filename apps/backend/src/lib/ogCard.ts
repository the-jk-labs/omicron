// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  Drawables,
  Magick,
  MagickColor,
  MagickFormat,
  MagickImage,
} from "@imagemagick/magick-wasm";
import { coveredCodepoints } from "@/lib/fontCoverage.ts";
import { initializeMagick } from "@/lib/magick.ts";

// The share card drawn for a post that has no image of its own.
//
// Every such post used to share as the same file: the instance's brand tile,
// identical on every link, carrying nothing about what was written. A card with
// the title on it is the difference between a link that says something and a
// link that says "somebody posted something somewhere".
//
// Deliberately free of config, database and filesystem concerns — like
// lib/shareImage.ts, whose caching lives in services/. This module takes three
// strings and returns JPEG bytes, which is what makes the layout testable.
//
// Drawn rather than composed from a template: a template would need the title
// rendered into it anyway, and text is the whole content of the card.

// The size every platform documents for a large summary card.
const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 88;
const BOX = WIDTH - PAD * 2;

// The vertical band the title is centred in. Bounded above by the accent bar
// and below by the two footer lines, so a four-line title can never grow into
// either of them.
const BAND_TOP = 132;
const BAND_BOTTOM = 476;
const BYLINE_BASELINE = 534;
const SITE_BASELINE = 578;

// Tried largest-first: a short title gets to be big, a long one shrinks rather
// than overflowing. Nothing below the last size — past that the title is
// truncated instead, because type this small on a card scaled down to a
// timeline thumbnail is not readable anyway.
const TITLE_SIZES = [72, 66, 60, 54, 48];
const MAX_LINES = 4;
const LINE_HEIGHT = 1.22;

const BACKGROUND = "#0a0a0a";
const TITLE_COLOR = "#ffffff";
const BYLINE_COLOR = "#e4e4e7";
const SITE_COLOR = "#71717a";

// Comfortably under WhatsApp's ~600KB ceiling; flat colour and text compress
// far better than a photograph, so this lands around 30-80KB.
const QUALITY = 88;

// The one face the card is drawn in, registered with ImageMagick under this
// name. See assets/fonts/README.md for what it is and where it came from.
const FONT = "omicron-og-card";
const FONT_PATH = new URL("../../assets/fonts/Inter-SemiBold.ttf", import.meta.url);

// Emoji and other pictographs are stripped before anything is measured. The
// bundled face has no glyphs for them, and ImageMagick answers a missing glyph
// with a blank advance rather than an error — so left in they punch holes in
// the title. A title minus its decorations is still the title; a title with
// gaps where the rocket was is not.
const PICTOGRAPHS = /[\p{Extended_Pictographic}\p{Emoji_Presentation}️‍]/gu;

// More characters than four lines at the smallest size could ever show, with
// room to spare. Nothing beyond this can appear on the card, and a title has no
// length limit anywhere else in the app — so without a bound here, one absurd
// title would put the layout's measuring loops to work on thousands of
// characters while a scraper waits.
const MAX_TITLE_CHARS = 240;

let fontReady: Promise<Set<number>> | null = null;

/** Registers the card font once and returns what it can draw. */
function loadFont(): Promise<Set<number>> {
  if (!fontReady) {
    fontReady = (async () => {
      await initializeMagick();
      const font = await Deno.readFile(FONT_PATH);
      Magick.addFont(FONT, font);
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

/** Greedy word wrap, breaking inside a word only when the word alone overflows. */
function wrap(text: string, size: number): string[] {
  const lines: string[] = [];
  let line = "";
  const push = () => {
    if (line) lines.push(line);
    line = "";
  };

  for (const word of text.split(" ")) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && widthOf(candidate, size) > BOX) {
      push();
      line = word;
    } else {
      line = candidate;
    }
    // A URL or an unbroken run of characters can be wider than the card on its
    // own, and no amount of word wrapping helps — break it where it lands.
    // Binary search rather than a walk back from the end: each probe is a
    // measurement through the wasm boundary, and a 300-character run walked one
    // character at a time took eleven seconds of a scraper's time.
    while (widthOf(line, size) > BOX && line.length > 1) {
      let low = 1;
      let high = line.length - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (widthOf(line.slice(0, mid), size) > BOX) high = mid - 1;
        else low = mid;
      }
      lines.push(line.slice(0, low));
      line = line.slice(low);
    }
  }
  push();
  return lines;
}

/** The largest size at which the title fits the band, or the smallest, truncated. */
function layout(title: string): { lines: string[]; size: number; lineHeight: number } {
  const band = BAND_BOTTOM - BAND_TOP;
  for (const size of TITLE_SIZES) {
    const lineHeight = Math.round(size * LINE_HEIGHT);
    const lines = wrap(title, size);
    if (lines.length <= MAX_LINES && lines.length * lineHeight <= band) {
      return { lines, size, lineHeight };
    }
  }

  const size = TITLE_SIZES[TITLE_SIZES.length - 1];
  const lineHeight = Math.round(size * LINE_HEIGHT);
  const lines = wrap(title, size).slice(0, MAX_LINES);
  const last = lines.length - 1;
  lines[last] = `${lines[last].replace(/[\s.,;:—–-]+$/, "")}…`;
  return { lines, size, lineHeight };
}

export type CardText = {
  /** The post's title. Decides whether a card is drawn at all. */
  title: string;
  /** The author, as a reader would see it written. */
  byline: string;
  /** The instance this was published on. */
  site: string;
};

/**
 * A post's share card as JPEG bytes, or null when the title cannot be drawn.
 *
 * Null is a real answer rather than an error: the bundled face covers Latin,
 * Greek and Cyrillic, so a title written in Japanese, Korean or Arabic would
 * render as an empty rectangle. The caller falls back to the instance's brand
 * image, which says less but at least says something.
 *
 * The byline and the site line are dropped individually on the same test. They
 * are context around the title, and a blank line is worse than no line.
 */
export async function renderOgCard(text: CardText): Promise<Uint8Array<ArrayBuffer> | null> {
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

  const title = renderable(text.title)?.slice(0, MAX_TITLE_CHARS);
  if (!title) return null;
  const byline = renderable(text.byline);
  const site = renderable(text.site);

  const { lines, size, lineHeight } = layout(title);
  // The first baseline sits one ascent below the block's top edge, so the cap
  // height of line one lands where the block is meant to start rather than a
  // whole line lower.
  const ascent = drawable(size).fontTypeMetrics(lines[0])?.ascent ?? size * 0.8;
  const blockTop = BAND_TOP + (BAND_BOTTOM - BAND_TOP - lines.length * lineHeight) / 2;
  const firstBaseline = Math.round(blockTop + ascent);

  const image = MagickImage.create();
  image.read(new MagickColor(BACKGROUND), WIDTH, HEIGHT);

  const draw = new Drawables();
  // A short white rule, the card's only ornament. Enough for a reader scrolling
  // a timeline to recognise two cards as coming from the same place.
  draw.fillColor(new MagickColor(TITLE_COLOR)).rectangle(PAD, 74, PAD + 56, 80);

  draw.font(FONT).fontPointSize(size).fillColor(new MagickColor(TITLE_COLOR));
  lines.forEach((line, i) => draw.text(PAD, firstBaseline + i * lineHeight, line));

  if (byline) {
    draw.fontPointSize(31).fillColor(new MagickColor(BYLINE_COLOR)).text(
      PAD,
      BYLINE_BASELINE,
      byline,
    );
  }
  if (site) {
    draw.fontPointSize(26).fillColor(new MagickColor(SITE_COLOR)).text(PAD, SITE_BASELINE, site);
  }
  draw.draw(image);

  image.quality = QUALITY;
  let out: Uint8Array<ArrayBuffer> | null = null;
  // Copied out of the callback: the buffer magick hands over is only valid for
  // the duration of the call.
  image.write(MagickFormat.Jpeg, (bytes) => {
    out = new Uint8Array(bytes);
  });
  if (!out) throw new Error("Share card could not be encoded.");
  return out;
}
