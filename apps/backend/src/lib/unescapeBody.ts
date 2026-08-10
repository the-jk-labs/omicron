// SPDX-License-Identifier: AGPL-3.0-or-later

// Repair for post bodies that were stored as *escaped* HTML.
//
// A post ingested over the content webhook — or imported over federation —
// carries no Tiptap document, so the editor rehydrated it from `contentHtml`.
// Until the editor learned to parse that string as HTML it handed the string to
// the Markdown parser instead, which is configured `html: false` and therefore
// escaped every tag it found. Saving such a post wrote the escaped text back:
// the body became one paragraph per line of the original, each reading
// `&lt;p&gt;…&lt;/p&gt;`, which the reader displays as literal angle brackets.
//
// The editor no longer does this (it parses the HTML). This module repairs the
// rows it already wrote — see scripts/backfill_unescape.ts.
//
// This is a one-way edit to stored content, so it is deliberately narrow:
// anything that is not unmistakably this damage is left alone for a human.

import { sanitizePostHtml } from "@/lib/sanitize.ts";

// What is inside <pre>/<code> is content, not markup: a tutorial legitimately
// shows `&lt;p&gt;` in a sample. Those regions are removed before the test
// rather than matched around.
const CODE = /<pre\b[\s\S]*?<\/pre>|<code\b[\s\S]*?<\/code>/gi;

// The signature of the damage: an escaped block-level tag out in the prose.
const ESCAPED_BLOCK = /&lt;\/?(?:p|div|h[1-6]|ul|ol|li|blockquote|figure|table)[\s/&>]/i;

// Everything a damaged body may legitimately contain as *real* markup: Tiptap
// wrapped each line of the escaped source in a paragraph and emitted nothing
// else. A row carrying any other real tag mixes working markup with escaped
// text, and no automatic rule can split those apart safely.
const WRAPPERS = new Set(["p", "br"]);
const TAG = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;

/** True when `html` looks like HTML source that was escaped into a body. */
export function isEscapedBody(html: string): boolean {
  return ESCAPED_BLOCK.test(html.replace(CODE, ""));
}

/** Real tags in `html` that are not the wrappers this repair expects. */
export function unexpectedTags(html: string): string[] {
  const found = [...html.matchAll(TAG)].map((m) => m[1].toLowerCase());
  return [...new Set(found.filter((t) => !WRAPPERS.has(t)))];
}

// Undo one round of HTML escaping. `&amp;` goes last: doing it first would turn
// `&amp;lt;` — a body that really does display "&lt;" — into a tag.
function unescape(text: string): string {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&");
}

/**
 * Rebuild the original source from the paragraphs it was escaped into, and put
 * it back through the sanitizer — the only gateway into `contentHtml`.
 */
export function repairEscapedBody(html: string): string {
  const source = html
    // Each wrapper paragraph boundary and each <br> was a newline in the source.
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/^\s*<p[^>]*>/i, "")
    .replace(/<\/p>\s*$/i, "")
    .trim();
  return sanitizePostHtml(unescape(source));
}
