// SPDX-License-Identifier: AGPL-3.0-or-later

// Which characters a bundled font can actually draw, read from the font itself.
//
// The generated share card (lib/ogCard.ts) renders a post title with one
// bundled face, and a face covers a fraction of Unicode. ImageMagick does not
// refuse a character it has no glyph for — it draws the font's `.notdef`, which
// in Inter is blank. A Japanese title therefore comes out as an *empty card*,
// which is worse than the brand image it replaced, and nothing about the render
// reports that anything went wrong.
//
// So the coverage is asked of the font rather than assumed. A hand-written list
// of Unicode ranges would be an approximation of one specific font's contents,
// wrong in both directions, and silently wrong again the day the file is
// swapped. Parsing `cmap` is exact and stays true to whatever is in assets/.
//
// Formats 4 (BMP) and 12 (full Unicode) are the two a modern TrueType font
// ships, and Inter carries both; anything else is ignored, which costs coverage
// rather than correctness — an unparsed subtable makes characters look
// unsupported, and an unsupported title falls back to the brand image.

const CMAP_FORMAT_4 = 4;
const CMAP_FORMAT_12 = 12;

/**
 * Every codepoint the font has a glyph for.
 *
 * Throws on a file that is not a TrueType/OpenType font, or one with no `cmap`
 * table — both of which mean the bundled asset is broken rather than that some
 * character is unsupported, and neither should be mistaken for empty coverage.
 */
export function coveredCodepoints(font: Uint8Array): Set<number> {
  const dv = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const cmap = findTable(font, dv, "cmap");
  if (cmap === null) throw new Error("Font has no cmap table.");

  const covered = new Set<number>();
  const subtables = dv.getUint16(cmap + 2);
  for (let i = 0; i < subtables; i++) {
    const offset = cmap + dv.getUint32(cmap + 4 + i * 8 + 4);
    const format = dv.getUint16(offset);
    if (format === CMAP_FORMAT_4) readFormat4(dv, offset, covered);
    else if (format === CMAP_FORMAT_12) readFormat12(dv, offset, covered);
  }
  return covered;
}

/** Byte offset of a table in the font's table directory, or null. */
function findTable(font: Uint8Array, dv: DataView, tag: string): number | null {
  const count = dv.getUint16(4);
  for (let i = 0; i < count; i++) {
    const record = 12 + i * 16;
    const name = String.fromCharCode(font[record], font[record + 1], font[record + 2], font[record + 3]);
    if (name === tag) return dv.getUint32(record + 8);
  }
  return null;
}

// Format 4: segments of the Basic Multilingual Plane, each mapping a character
// range through either a delta or an index into `glyphIdArray`. A glyph id of 0
// is `.notdef` and means the segment does not really cover that character.
function readFormat4(dv: DataView, offset: number, into: Set<number>): void {
  const segCount = dv.getUint16(offset + 6) / 2;
  const ends = offset + 14;
  const starts = ends + segCount * 2 + 2;
  const deltas = starts + segCount * 2;
  const rangeOffsets = deltas + segCount * 2;

  for (let seg = 0; seg < segCount; seg++) {
    const end = dv.getUint16(ends + seg * 2);
    const start = dv.getUint16(starts + seg * 2);
    // The final segment is a required 0xFFFF sentinel, not real coverage.
    if (start > end || start === 0xffff) continue;
    const delta = dv.getInt16(deltas + seg * 2);
    const rangeOffset = dv.getUint16(rangeOffsets + seg * 2);

    for (let code = start; code <= end; code++) {
      let glyph: number;
      if (rangeOffset === 0) {
        glyph = (code + delta) & 0xffff;
      } else {
        // The spec's pointer arithmetic: the offset is counted in bytes from
        // the position of the rangeOffset entry itself.
        const at = rangeOffsets + seg * 2 + rangeOffset + (code - start) * 2;
        if (at + 1 >= dv.byteLength) continue;
        glyph = dv.getUint16(at);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) into.add(code);
    }
  }
}

// Format 12: flat groups of contiguous codepoints, and the only subtable that
// reaches beyond the BMP (where emoji live).
function readFormat12(dv: DataView, offset: number, into: Set<number>): void {
  const groups = dv.getUint32(offset + 12);
  for (let i = 0; i < groups; i++) {
    const group = offset + 16 + i * 12;
    const start = dv.getUint32(group);
    const end = dv.getUint32(group + 4);
    const startGlyph = dv.getUint32(group + 8);
    if (startGlyph === 0) continue;
    for (let code = start; code <= end; code++) into.add(code);
  }
}
