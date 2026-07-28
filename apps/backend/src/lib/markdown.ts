// SPDX-License-Identifier: AGPL-3.0-or-later

// Markdown → HTML for author-written free-form content (currently the profile
// custom section, see services/users.ts). Rendering happens once, on write, and
// the result goes straight through `sanitizePostHtml` — the same allowlist
// gateway posts use — before it is stored. Callers must never render Markdown at
// read time or hand raw output to a client.
//
// Raw HTML in the source is *parsed* (`html: true`) rather than escaped, so
// authors can drop in a `<table>` or an `<img>` the way they would in a GitHub
// README. That is safe here precisely because nothing reaches storage without
// passing the sanitizer: unknown tags, styles, scripts and event handlers are
// dropped there. Do not remove that final step.

// @ts-types="npm:@types/markdown-it@^14"
import MarkdownIt from "markdown-it";
// @ts-types="npm:@types/markdown-it@^14/lib/token.d.mts"
import type Token from "markdown-it/lib/token.mjs";
import { sanitizePostHtml } from "@/lib/sanitize.ts";

const md = new MarkdownIt({
  html: true,
  linkify: true, // bare URLs become links
  breaks: true, // a single newline is a line break, matching the post editor
  typographer: false, // leave the author's punctuation exactly as typed
});

// GitHub-style task lists. markdown-it has no rule for them, and rendering real
// `<input type=checkbox>` would mean widening the sanitizer's tag allowlist for
// a purely decorative element — so the marker becomes a Unicode box instead,
// which needs no new tags and copies as text.
const CHECKED = "☑ "; // ☑
const UNCHECKED = "☐ "; // ☐

function taskLists(tokens: Token[]) {
  for (let i = 0; i < tokens.length; i++) {
    const inline = tokens[i];
    // A task item is the inline content of the first paragraph of a list item.
    if (inline.type !== "inline") continue;
    if (tokens[i - 1]?.type !== "paragraph_open") continue;
    if (tokens[i - 2]?.type !== "list_item_open") continue;

    const match = /^\[([ xX])\][ \t]+/.exec(inline.content);
    if (!match) continue;

    const marker = match[1] === " " ? UNCHECKED : CHECKED;
    inline.content = marker + inline.content.slice(match[0].length);
    // The children were already tokenized, so patch the leading text token too
    // — the renderer walks children, not `content`.
    const first = inline.children?.[0];
    if (first?.type === "text") first.content = marker + first.content.slice(match[0].length);
  }
}

md.core.ruler.push("omicron_task_lists", (state) => taskLists(state.tokens));

/**
 * Render author-written Markdown to sanitized, storage-ready HTML.
 * Returns "" for empty input. Safe to call on untrusted text.
 */
export function renderMarkdown(source: string | null | undefined): string {
  if (!source || !source.trim()) return "";
  return sanitizePostHtml(md.render(source));
}
