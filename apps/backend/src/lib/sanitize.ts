// SPDX-License-Identifier: AGPL-3.0-or-later

// Post body HTML sanitizer. This is the ONLY trusted gateway for rich-text
// content: every post body — whether written locally via Tiptap or ingested
// from a remote ActivityPub Article — must pass through `sanitizePostHtml`
// before it is stored. The reader renders `contentHtml` with `{@html}`, so any
// unsanitized markup that reaches the database is a stored-XSS vector.
//
// We deliberately use the battle-tested `sanitize-html` (an allowlist parser)
// rather than hand-rolled regex: HTML is not a regular language and every
// hand-rolled stripper eventually ships a bypass.

import sanitizeHtml from "sanitize-html";

// The allowlist covers the nodes our Tiptap editor emits (StarterKit + Link +
// Image) plus the common long-form elements remote Articles carry (tables,
// figures, definition lists, sub/sup). Anything not listed — script, style,
// iframe, object, embed, form, event handlers, inline styles — is dropped.
const ALLOWED_TAGS = [
  "p",
  "br",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "ins",
  "mark",
  "sub",
  "sup",
  "small",
  "a",
  "img",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "span",
  // Layout + disclosure elements. Authors reach for these in the profile's
  // custom Markdown section (see lib/markdown.ts) to centre a banner or fold a
  // long list away, the way a GitHub README does. All four are inert: they carry
  // no script surface, and `style` stays banned, so the blast radius is layout.
  "div",
  "details",
  "summary",
  "kbd",
  "figure",
  "figcaption",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "colgroup",
  "col",
  "dl",
  "dt",
  "dd",
];

// MathML, as produced by KaTeX from `$…$` maths (see lib/markdown.ts) and as
// carried by remote Articles. Presentation elements only: every one of these
// draws a glyph, a fraction bar or a grid and has no script surface. `maction`
// — the one MathML element with behaviour attached — is deliberately absent.
const MATHML_TAGS = [
  "math",
  "semantics",
  "annotation",
  "mrow",
  "mi",
  "mn",
  "mo",
  "ms",
  "mtext",
  "mspace",
  "mfrac",
  "msqrt",
  "mroot",
  "msub",
  "msup",
  "msubsup",
  "munder",
  "mover",
  "munderover",
  "mmultiscripts",
  "mprescripts",
  "none",
  "mstyle",
  "mpadded",
  "mphantom",
  "menclose",
  "merror",
  "mtable",
  "mtr",
  "mtd",
  "mlabeledtr",
];

// Attributes MathML uses to say how a formula is laid out — spacing, stretchy
// brackets, alignment of a matrix. Presentational, inert, and identical on every
// element that accepts them, so the whole set is granted to the whole vocabulary
// rather than spelled out element by element.
const MATHML_ATTRIBUTES = [
  "accent",
  "accentunder",
  "columnalign",
  "columnlines",
  "columnspacing",
  "columnspan",
  "depth",
  "display",
  "displaystyle",
  "encoding",
  "fence",
  "form",
  "height",
  "largeop",
  "linethickness",
  "lspace",
  "mathsize",
  "mathvariant",
  "maxsize",
  "minsize",
  "movablelimits",
  "notation",
  "rowalign",
  "rowlines",
  "rowspacing",
  "rowspan",
  "rspace",
  "scriptlevel",
  "separator",
  "stretchy",
  "symmetric",
  "voffset",
  "width",
  "xmlns",
];

// Tags whose *contents* go too, not just the tag — so stray script/style text
// never leaks into the rendered output.
const NON_TEXT_TAGS = ["script", "style", "textarea", "option", "noscript"];

/**
 * The tags this sanitizer keeps — the markup it will actually render — lowercased.
 * Exported so the Markdown renderer can tell markup it should parse from
 * everything else: an author's `<Widget />`, or a tag the sanitizer refuses like
 * `<iframe>`, both of which it shows as the text that was typed rather than
 * parsing (and, for a refused tag, rather than letting the parser swallow the
 * rest of the document). See lib/markdown.ts.
 */
export const RENDERABLE_POST_TAGS: ReadonlySet<string> = new Set(
  [...ALLOWED_TAGS, ...MATHML_TAGS].map((t) => t.toLowerCase()),
);

const CONFIG: sanitizeHtml.IOptions = {
  allowedTags: [...ALLOWED_TAGS, ...MATHML_TAGS],
  allowedAttributes: {
    // `rel`/`target` are re-set by transformTags below; they must be allowed
    // here or the attribute filter would strip them straight back off.
    a: ["href", "name", "rel", "target"],
    img: ["src", "alt", "title", "width", "height", "class", "align"],
    // Presentational alignment only — the one bit of layout control we grant
    // without opening up `style`.
    div: ["align"],
    // `class` on a paragraph is only ever `katex-block`, the wrapper KaTeX puts
    // around a `$$…$$` formula; `allowedClasses` below is what holds it to that.
    p: ["align", "class"],
    // Collapsible sections may start expanded.
    details: ["open"],
    // Syntax-highlighted code blocks carry `language-*` / `hljs` classes.
    code: ["class"],
    // `data-title` is the optional filename on a fence (see lib/markdown.ts).
    // Inert by construction: a data attribute the reader renders as a caption,
    // with no behaviour attached and its value escaped on the way out.
    pre: ["class", "data-title"],
    span: ["class"],
    // Table cell alignment/spanning is structural, not stylistic.
    th: ["colspan", "rowspan", "scope"],
    td: ["colspan", "rowspan"],
    col: ["span"],
    colgroup: ["span"],
    ...Object.fromEntries(MATHML_TAGS.map((tag) => [tag, MATHML_ATTRIBUTES])),
  },
  // Only safe URL schemes. Note: no `data:` — it enables data-URI payloads
  // (e.g. SVG scripts) and bloats stored HTML; local images are same-origin URLs.
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    img: ["http", "https"],
  },
  // Reject protocol-relative URLs (`//evil.example`) — force an explicit scheme.
  allowProtocolRelative: false,
  // Constrain `class` to a known-safe prefix set so remote content can't smuggle
  // in our utility classes to break layout, while keeping code highlighting.
  allowedClasses: {
    code: ["language-*", "hljs", "hljs-*"],
    pre: ["language-*", "hljs", "hljs-*"],
    // `katex` wraps a formula; `katex-error` marks one KaTeX could not parse.
    span: ["hljs-*", "katex", "katex-error"],
    p: ["katex-block"],
    // The exact utility classes our Tiptap Image node emits, so locally authored
    // images keep their centering/rounding. Any other class is dropped.
    img: ["rounded-card", "mx-auto", "my-6", "max-w-full"],
  },
  // Harden every surviving link against tab-nabbing and referrer leakage, and
  // mark it nofollow. Applied uniformly regardless of the source's own rel.
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      rel: "noopener noreferrer nofollow",
      target: "_blank",
    }),
  },
  nonTextTags: NON_TEXT_TAGS,
};

/**
 * Sanitize untrusted post-body HTML into a safe subset for storage + rendering.
 * Safe to call on already-clean local content (idempotent) and required on all
 * remote content before it is persisted.
 */
export function sanitizePostHtml(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtml(html, CONFIG);
}
