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
// CommonJS, so the plugin arrives as the module's `exports` object rather than
// the function itself.
import katexModule from "@vscode/markdown-it-katex";
type Plugin = (md: MarkdownIt, options?: Record<string, unknown>) => void;
const katex = (katexModule as unknown as { default?: Plugin }).default ??
  (katexModule as unknown as Plugin);

import { sanitizePostHtml } from "@/lib/sanitize.ts";

const md = new MarkdownIt({
  html: true,
  linkify: true, // bare URLs become links
  breaks: true, // a single newline is a line break, matching the post editor
  typographer: false, // leave the author's punctuation exactly as typed
});

// TeX maths, `$inline$` and `$$display$$`, rendered here rather than in the
// browser: the reader ships no maths engine and a remote instance rendering our
// Article gets finished markup too.
//
// Output is **MathML**, not KaTeX's usual HTML. MathML is native in every
// current browser, needs no stylesheet, and — the reason it matters here —
// carries no inline `style`, so the formula survives `sanitizePostHtml` intact
// instead of arriving as a heap of unstyled spans.
//
// The rule runs during inline parsing, ahead of emphasis, which is what keeps
// `\Sigma_{\mathrm{ss}} … k_{\mathrm{B}}` from having its two underscores paired
// into an `<em>`. Delimiters must hug their content (`$x$`, never `$ x$`) and a
// digit may not follow the closer, so prices — "$5 and $6" — stay prices.
md.use(katex, {
  output: "mathml",
  // A malformed formula renders as the offending source in an error span rather
  // than taking down the whole render. Nothing an author types can 500 a post.
  throwOnError: false,
  strict: false,
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

// Loose bold. CommonMark requires a closing `**` to sit flush against the text
// it ends — `**bold**`, never `**bold **` — and leaves the loose form as
// literal asterisks. Writers produce that form constantly (`**NestJS: **`), and
// what the reader gets is a paragraph peppered with `**`.
//
// So: any `**` markers the standard parser declined to use are paired up here
// and treated as emphasis anyway. What sits between them is wrapped verbatim,
// whitespace included — `**NestJS: **` becomes `<strong>NestJS: </strong>`, the
// space kept, so the words either side never run together. A pair with nothing
// but space between it is honoured on the same principle: what the author typed
// is what they meant.
//
// Running after inline parsing is what makes this safe. By then every code
// fence and code span is its own token, so a `**` inside one is never a
// candidate — only markers left stranded in text are. An odd marker with no
// partner stays literal.
//
// Scope is `**` alone. `__bold__` has the same rule in CommonMark, but it is
// rare in the wild and doubling the surface here would double the false pairs.

type TokenCtor = new (type: string, tag: string, nesting: number) => Token;

/** Every `**` still sitting in a text token, in reading order. */
function looseMarks(children: Token[]): Array<{ child: number; at: number }> {
  const marks: Array<{ child: number; at: number }> = [];
  children.forEach((child, index) => {
    if (child.type !== "text") return;
    for (
      let at = child.content.indexOf("**");
      at !== -1;
      at = child.content.indexOf("**", at + 2)
    ) {
      marks.push({ child: index, at });
    }
  });
  return marks;
}

/**
 * Split the text token holding `mark` around it, dropping the two asterisks and
 * putting a `<strong>` boundary in their place.
 */
function splitAtMark(
  children: Token[],
  mark: { child: number; at: number },
  nesting: 1 | -1,
  Token: TokenCtor,
): void {
  const text = children[mark.child];
  const before = text.content.slice(0, mark.at);
  const after = text.content.slice(mark.at + 2);

  const tag = new Token(nesting === 1 ? "strong_open" : "strong_close", "strong", nesting);
  tag.markup = "**";

  const parts: Token[] = [];
  if (before) parts.push(textToken(before, Token));
  parts.push(tag);
  if (after) parts.push(textToken(after, Token));
  children.splice(mark.child, 1, ...parts);
}

function textToken(content: string, Token: TokenCtor): Token {
  const token = new Token("text", "", 0);
  token.content = content;
  return token;
}

function looseStrong(children: Token[], Token: TokenCtor): Token[] {
  const marks = looseMarks(children);
  if (marks.length < 2) return children;

  const out = children.slice();
  // Back to front, so the offsets and indices of the pairs still to be handled
  // are never disturbed by a split that has already happened. Within a pair the
  // closer goes first for the same reason.
  for (let k = (marks.length & ~1) - 2; k >= 0; k -= 2) {
    splitAtMark(out, marks[k + 1], -1, Token);
    splitAtMark(out, marks[k], 1, Token);
  }
  return out;
}

md.core.ruler.push("omicron_loose_strong", (state) => {
  for (const token of state.tokens) {
    if (token.type !== "inline" || !token.children) continue;
    token.children = looseStrong(token.children, state.Token as unknown as TokenCtor);
  }
});

// Optional filename on a fence, the way docs sites spell it:
//
//     ```ts title="@/lib/name.ts"
//
// markdown-it takes the first word of the info string as the language and
// discards the rest, so the title has to be carried over deliberately. It rides
// on the `<pre>` as `data-title` — an attribute rather than markup, so the
// stored HTML stays a plain code block and whoever renders it decides what a
// filename header looks like (the reader draws one; a remote instance showing
// the raw block simply ignores it).
const FENCE_TITLE = /(?:^|\s)(?:title|filename)\s*=\s*("([^"]*)"|'([^']*)')/i;

/** Longest filename we will carry. Long enough for a deep path, short enough
 * that a pathological info string cannot bloat every stored row. */
const MAX_TITLE = 120;

export function fenceTitle(info: string): string | null {
  const match = FENCE_TITLE.exec(info);
  const value = (match?.[2] ?? match?.[3] ?? "").trim();
  return value ? value.slice(0, MAX_TITLE) : null;
}

const defaultFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const html = defaultFence(tokens, idx, options, env, self);
  const title = fenceTitle(tokens[idx].info);
  if (!title) return html;
  // The default renderer always opens with `<pre`, with or without attributes.
  // `escapeHtml` is what makes a title containing a quote inert rather than an
  // attribute injection — the sanitizer would catch it too, but this is the
  // layer that produces the markup, so it escapes its own output.
  return html.replace(/^<pre/, `<pre data-title="${md.utils.escapeHtml(title)}"`);
};

/**
 * Render author-written Markdown to sanitized, storage-ready HTML.
 * Returns "" for empty input. Safe to call on untrusted text.
 */
export function renderMarkdown(source: string | null | undefined): string {
  if (!source || !source.trim()) return "";
  return sanitizePostHtml(md.render(source));
}
