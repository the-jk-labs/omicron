// SPDX-License-Identifier: AGPL-3.0-or-later
// Repairs posts stored before maths was rendered (see lib/markdown.ts). Their
// HTML still carries the TeX as literal text — `$$\frac{a}{b}$$` sitting in a
// paragraph — because a post is rendered once, on write, and never again.
//
// The awkward part is that Markdown got to the formula first. Emphasis pairs the
// underscores a subscript is made of, so `\Sigma_{ss} \ge k_{B}` reached storage
// as `\Sigma<em>{ss} \ge k</em>{B}`: the source has to be reassembled from the
// tags before KaTeX can be handed anything. Only `<em>`/`<i>` are put back — the
// marks Markdown makes out of `_`, which is the only character TeX and Markdown
// genuinely fight over.
//
// The transform is conservative and idempotent: a rendered formula has no `$`
// left in it, text that does not look like TeX is left alone, and code is never
// touched at all. Safe to run repeatedly across every post.

import katex from "katex";
import { sanitizePostHtml } from "@/lib/sanitize.ts";

/** Segments we pass through untouched: a `$` in code is a shell prompt. */
const CODE = /<(pre|code)\b[\s\S]*?<\/\1>/gi;

/** `$$…$$` first, so its delimiters are never read as two inline formulas. */
const DISPLAY = /\$\$([\s\S]+?)\$\$/g;
/** Inline maths stays within one line, the way every `$…$` dialect has it. */
const INLINE = /\$([^$\n]+?)\$/g;

/**
 * Does this look like TeX rather than money? A formula worth rendering carries a
 * command, a script or a group; "it costs $5 and $6" carries none of them, and
 * anything that reached storage as plain prose stays prose.
 *
 * A bare symbol — `$d$`, `$n$` — has none of those marks either, so it is let
 * through on a second test: one short word, no spaces, and a letter in it. A
 * price is several words ("$5 and $6") or no letters at all, and fails both.
 */
function looksLikeTex(source: string): boolean {
  return /[\\^_{}]/.test(source) || /^[A-Za-z][A-Za-z0-9]{0,3}$/.test(source);
}

/**
 * Markdown ate the backslash in `\{` and `\}` before the post was stored, which
 * leaves `\left\{ … \right\}` as `\left{ … \right}` — and `\right}` is not a
 * formula KaTeX can parse at all. Since neither spelling means anything on its
 * own, putting the escape back can only turn an error into a formula.
 */
function repairDelimiters(tex: string): string {
  return tex.replace(/\\(left|right|middle)([{}])/g, "\\$1\\$2");
}

/** The tags Markdown made out of the formula's underscores, put back. */
function restoreUnderscores(html: string): string {
  return html.replace(/<\/?(?:em|i)>/gi, "_");
}

/** A line break inside a multi-line `$$…$$` block is a line break in the TeX. */
function restoreNewlines(html: string): string {
  return html.replace(/<br\s*\/?>/gi, "\n");
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#39|apos);/g, (entity) => ENTITIES[entity] ?? entity);
}

/** The TeX as the author typed it, recovered from what Markdown left behind. */
function recoverTex(html: string): string | null {
  const tex = repairDelimiters(
    decodeEntities(restoreNewlines(restoreUnderscores(html))).trim(),
  );
  // Any tag still standing is something we cannot account for — a link, an
  // image, a stray span. Rendering it would destroy content, so we decline.
  if (!tex || /<[a-z/]/i.test(tex) || !looksLikeTex(tex)) return null;
  return tex;
}

function render(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, {
    output: "mathml",
    displayMode,
    throwOnError: false,
    strict: false,
  });
}

/** Render every formula in one run of ordinary (non-code) markup. */
function renderRun(html: string): string {
  let out = html.replace(DISPLAY, (whole, inner: string) => {
    const tex = recoverTex(inner);
    return tex ? render(tex, true) : whole;
  });
  out = out.replace(INLINE, (whole, inner: string) => {
    const tex = recoverTex(inner);
    return tex ? render(tex, false) : whole;
  });
  // A failure alone in its paragraph was a `$$…$$` block; anything else sat in a
  // sentence. Retrying in the wrong mode would render it at the wrong size.
  out = out.replace(
    /<p>\s*<span class="katex-error">[^<]*<\/span>\s*<\/p>/g,
    (paragraph) => retryErrors(paragraph, true),
  );
  return retryErrors(out, false);
}

/** A formula an earlier run could not parse, kept as the source it was given. */
const ERROR_SPAN = /<span class="katex-error">([^<]*)<\/span>/g;

/**
 * Give the failures another go. An earlier run of this backfill stored what it
 * could not parse as a `katex-error` span — no `$` left to find it by — so a
 * later, better-informed run has to reach for those spans by name. A formula
 * that still will not parse keeps its span and waits for the next improvement.
 */
function retryErrors(html: string, displayMode: boolean): string {
  return html.replace(ERROR_SPAN, (whole, inner: string) => {
    const tex = repairDelimiters(decodeEntities(inner).trim());
    try {
      return katex.renderToString(tex, {
        output: "mathml",
        displayMode,
        throwOnError: true,
        strict: false,
      });
    } catch {
      return whole;
    }
  });
}

/**
 * A paragraph holding nothing but a display formula becomes the same
 * `katex-block` wrapper a freshly rendered post gets, so old and new posts style
 * identically.
 */
function markDisplayParagraphs(html: string): string {
  return html.replace(
    /<p>(\s*<span class="katex">[\s\S]*?<\/span>\s*)<\/p>/g,
    (_whole, inner: string) => `<p class="katex-block">${inner}</p>`,
  );
}

export function upgradeLegacyMath(html: string): string {
  // Nothing left to typeset and nothing left to retry.
  if (!html.includes("$") && !html.includes("katex-error")) return html;

  let out = "";
  let cursor = 0;
  // Walk the code segments, rendering only what lies between them.
  CODE.lastIndex = 0;
  for (let match = CODE.exec(html); match; match = CODE.exec(html)) {
    out += renderRun(html.slice(cursor, match.index)) + match[0];
    cursor = match.index + match[0].length;
  }
  out = markDisplayParagraphs(out + renderRun(html.slice(cursor)));

  // The formulas are new markup on a stored row, so they go through the same
  // gateway everything else does rather than being trusted for being ours.
  return out === html ? html : sanitizePostHtml(out);
}
