import { codeLanguageLabel } from "$lib/codeLanguages";
import { type FileIcon, fileIcon } from "$lib/fileIcons";
import type { LanguageFn } from "highlight.js";
// SPDX-License-Identifier: AGPL-3.0-or-later
import hljs from "highlight.js/lib/common";
import dart from "highlight.js/lib/languages/dart";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import elixir from "highlight.js/lib/languages/elixir";
import haskell from "highlight.js/lib/languages/haskell";
import powershell from "highlight.js/lib/languages/powershell";
import scala from "highlight.js/lib/languages/scala";

// Syntax highlighting for rendered post bodies.
//
// This runs when a post is **read**, in the server load, not when it is written.
// That choice matters:
//
//   * Every post ever published is highlighted, including the ones already in
//     the database. Highlighting on write would need a backfill, and would have
//     to be done twice — once in the Markdown renderer for ingested posts, once
//     in the editor for human-written ones.
//   * Stored HTML stays the author's content. What federates, what a remote
//     instance caches, and what the editor rehydrates are all untouched by a
//     presentation concern, so changing the theme later rewrites no rows.
//   * It happens on the server, so highlighted code is in the HTML the reader
//     (and a search engine) first receives — no flash of unstyled code, and it
//     works with JavaScript disabled.
//
// The `hljs-*` classes this emits are already in the sanitizer's allowlist
// (backend lib/sanitize.ts), so a remote instance that sends pre-highlighted
// HTML keeps its colours instead of having them stripped on the way in.
//
// The `common` bundle carries ~40 languages rather than all ~190. It is the
// standard highlight.js subset and covers what people put in blog posts; an
// unrecognised language falls back to plain text rather than failing. On top
// of it we register the languages the editor's picker offers that the bundle
// leaves out (Dockerfile, Elixir, …) — a language the picker promises but the
// reader cannot highlight would be a silently broken promise, and every one
// registered here also widens what auto-detection can find.

// Post HTML is sanitizer-normalised, so a code block is always exactly this
// shape: sanitize-html re-serialises the tree and drops every attribute that
// isn't allowlisted, which for `code` and `pre` is `class` and `data-title`.
const CODE_BLOCK = /<pre([^>]*)><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g;
// The optional filename a fence can declare (backend lib/markdown.ts). Captured
// still-escaped: it goes back into HTML as caption text, so the escaping the
// sanitizer applied is exactly the escaping it needs there.
const TITLE_ATTR = /(?:^|\s)data-title="([^"]*)"/;
// Matched against the raw attribute text, where the class is quoted
// (`class="language-ts"`) — so the delimiter before the name is a quote as
// often as it is whitespace.
const LANGUAGE_CLASS = /(?:^|[\s"'])language-([\w+#.-]+)/i;

// Below this, highlight.js is guessing. An auto-detected block that scores low
// is usually prose or config in a fenced block, where speculative colouring
// looks like a bug — leave those plain. The floor sits at six because English
// prose measurably reaches five: "If it shows enabled we can do our next
// step" scores five as VB.NET ("do", "next", "step", "to", "in" are all its
// keywords), so five cannot tell sentence from snippet. Shell command
// transcripts, which score far lower still, are handled separately below —
// see SHELL_GRAMMARS.
const MIN_AUTO_RELEVANCE = 6;

// The languages the editor's picker offers that `highlight.js/lib/common`
// leaves unregistered (toml, tsx and jsx already resolve — they are aliases of
// ini and javascript). Registering them is what makes a declared ```dockerfile
// or ```elixir fence highlight instead of silently rendering plain.
const PICKER_LANGUAGES: ReadonlyArray<[string, LanguageFn]> = [
  ["dart", dart],
  ["dockerfile", dockerfile],
  ["elixir", elixir],
  ["haskell", haskell],
  ["powershell", powershell],
  ["scala", scala],
];
for (const [name, grammar] of PICKER_LANGUAGES) hljs.registerLanguage(name, grammar);

// The one gap a relevance floor can never close: the shell command transcript.
// A tutorial's `sudo dnf install -y openssh-server` scores 1–3 — bash has few
// keywords to reward — while an English sentence routinely scores higher still
// ("and", "in", "is" are SQL and VB.NET keywords to the highlighter), so no
// threshold colours the commands without colouring the prose. What actually
// separates them is not relevance but function words: prose cannot be written
// without them, and a command transcript contains none (measured: prose ≥ 0.5,
// commands 0.0). So an undeclared block whose best guess is a shell grammar,
// scoring at least something, and reading as no prose, is a command transcript
// — colour it. The stopword guard is what keeps an English sentence that
// happens to score bash from being painted; the ratio sits far below prose's
// floor, and a declared language is never overridden by the rescue.
const SHELL_GRAMMARS = new Set(["bash", "shell"]);
const PROSE_WORDS =
  /\b(?:the|a|an|and|or|but|if|then|else|when|we|you|they|it|is|are|was|were|be|been|being|to|of|in|on|at|for|with|from|by|that|this|these|those|there|here|as|so|not|no|can|could|should|would|will|shall|may|might|must|do|does|did|have|has|had|our|your|their|its|his|her|my|me|us|them|he|she)\b/gi;
const MAX_PROSE_STOPWORD_RATIO = 0.25;

function readsAsProse(source: string): boolean {
  const words = source.match(/[a-zA-Z']+/g) ?? [];
  if (words.length < 3) return false;
  const matches = source.match(PROSE_WORDS) ?? [];
  return matches.length / words.length > MAX_PROSE_STOPWORD_RATIO;
}

// The five entities sanitize-html emits, back to their characters. `&amp;` is
// undone last: doing it first would turn a literal `&lt;` written by the author
// into a `<`, which highlight.js would then re-escape as markup they never
// wrote.
function decodeEntities(html: string): string {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Add highlight.js markup to every fenced code block in a rendered post body.
 *
 * The language comes from the `language-*` class a Markdown fence produces
 * (```ts). Without one — an editor code block, which carries no language — the
 * language is detected, and left alone when detection is not confident. The
 * exception is a shell command transcript, which relevance alone cannot vouch
 * for (see SHELL_GRAMMARS).
 *
 * Returns the HTML unchanged when it holds no code, so an ordinary post costs
 * one `includes` and nothing else.
 */
export function highlightCodeBlocks(html: string): string {
  if (!html.includes("<pre")) return html;

  return html.replace(CODE_BLOCK, (block, preAttrs: string, codeAttrs: string, body: string) => {
    const declared = LANGUAGE_CLASS.exec(codeAttrs)?.[1]?.toLowerCase();
    const title = TITLE_ATTR.exec(preAttrs)?.[1] ?? null;
    const source = decodeEntities(body);
    // Still caption an empty or unhighlightable block — the filename is the
    // author's, and it should show whether or not the highlighter had anything
    // to say about the contents.
    if (!source.trim()) return withTitle(block, title, declared);

    let language: string | undefined;
    let value: string;
    try {
      if (declared && hljs.getLanguage(declared)) {
        // `ignoreIllegals` keeps a snippet — a fragment, pseudo-code, a diff of
        // one function — from throwing just because it isn't a whole valid
        // program. A blog post is full of those.
        value = hljs.highlight(source, { language: declared, ignoreIllegals: true }).value;
        language = declared;
      } else {
        const auto = hljs.highlightAuto(source);
        // Confident guess, or an undeclared shell transcript (see
        // SHELL_GRAMMARS above — never over a declared language: the author
        // said what the block is, and a guess must not paint over that).
        const confident =
          auto.relevance >= MIN_AUTO_RELEVANCE ||
          (!declared && SHELL_GRAMMARS.has(auto.language ?? "") && auto.relevance > 0 && !readsAsProse(source));
        if (!auto.language || !confident) {
          return withTitle(block, title, declared);
        }
        value = auto.value;
        language = auto.language;
      }
    } catch {
      // Never let a highlighter bug cost someone their article: fall back to
      // the block exactly as it was stored.
      return withTitle(block, title, declared);
    }

    // `class` and `data-title` are the only attributes the sanitizer allows on
    // these tags, and both are accounted for here — so rebuilding the tag drops
    // nothing an author put there. The title moves into the caption, which is
    // why it does not stay on the `<pre>`.
    const pre = `<pre><code class="hljs language-${language}">${value}</code></pre>`;
    return withTitle(pre, title, declared);
  });
}

/**
 * Wrap a code block in a captioned figure when its author said what it is.
 *
 * Either half is enough. A filename is captioned with the filename; a block
 * that only declares a language is captioned with the language's name, which is
 * otherwise invisible to a reader — the whole point of declaring it. Only
 * `declared` counts, never a detected language: captioning a guess would put
 * "Perl" over someone's config file with all the confidence of a fact.
 *
 * A caption rather than a `::before` on the `<pre>`: the block scrolls
 * horizontally, and a pseudo-element inside it would scroll away with the code
 * and stop short of the full width. As a sibling it stays put.
 *
 * The caption leads with a chip for the file type (lib/fileIcons.ts) — the
 * language's own mark where one is published, its letters otherwise — taken
 * from the filename's extension or, failing that, the language.
 *
 * `title` arrives HTML-escaped (it was read straight out of the attribute), so
 * it is interpolated as-is — escaping it twice would show `&amp;` to the reader.
 * The chip's label comes from the same string but is built from a strict
 * character class, so nothing unescaped can ride in on it, and the path data is
 * ours rather than the author's.
 */
function withTitle(pre: string, title: string | null, declared?: string | null): string {
  // The language name is built from our own table, never from the block, so it
  // needs no escaping of its own.
  const name = title ?? (declared ? codeLanguageLabel(declared) : "");
  if (!name) return pre;
  const icon = fileIcon(title, declared);
  const chip = icon ? `<span class="code-icon" data-tone="${icon.tone}">${glyph(icon)}</span>` : "";
  return (
    `<figure class="code-figure"><figcaption class="code-title">${chip}` +
    `<span class="code-name">${name}</span></figcaption>${pre}</figure>`
  );
}

/**
 * What goes inside the chip: the language's mark, or its letters when no mark
 * is published for it.
 *
 * The mark is labelled rather than hidden — beside a title like "The reducer",
 * which names no language, the chip is the only thing that says which one this
 * is. `fill` is set on the element so the logo takes the chip's tone through
 * `currentColor` even where the stylesheet has not loaded.
 */
function glyph(icon: FileIcon): string {
  if (!icon.path) return icon.label;
  return (
    `<svg viewBox="0 0 24 24" fill="currentColor" role="img" ` +
    `aria-label="${icon.label}"><path d="${icon.path}"/></svg>`
  );
}
