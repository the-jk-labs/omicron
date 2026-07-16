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

const CONFIG: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    // `rel`/`target` are re-set by transformTags below; they must be allowed
    // here or the attribute filter would strip them straight back off.
    a: ["href", "name", "rel", "target"],
    img: ["src", "alt", "title", "width", "height", "class"],
    // Syntax-highlighted code blocks carry `language-*` / `hljs` classes.
    code: ["class"],
    pre: ["class"],
    span: ["class"],
    // Table cell alignment/spanning is structural, not stylistic.
    th: ["colspan", "rowspan", "scope"],
    td: ["colspan", "rowspan"],
    col: ["span"],
    colgroup: ["span"],
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
    span: ["hljs-*"],
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
  // Drop the *contents* of these, not just the tags, so stray script/style text
  // never leaks into the rendered output.
  nonTextTags: ["script", "style", "textarea", "option", "noscript"],
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
