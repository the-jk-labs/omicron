// SPDX-License-Identifier: AGPL-3.0-or-later
// Repairs posts authored before the editor parsed Markdown. Back then the editor
// dropped pasted Markdown in verbatim, so each source line became its own
// `<p>…</p>` with the block markers (`## `, `- `, `> `, …) left as literal text.
// Inline marks (bold, links) were already real HTML, so we only rebuild the
// block structure and leave each paragraph's inner HTML untouched.
//
// The transform is conservative and idempotent: paragraphs that don't start with
// a block marker (including every paragraph in a correctly-authored post) pass
// through unchanged, so it's safe to run repeatedly across all posts.

const HR = /^(?:---|\*\*\*|___)\s*$/;
const HEADING = /^(#{1,6})\s+([\s\S]*)$/;
const BULLET = /^[-*+]\s+([\s\S]*)$/;
const ORDERED = /^\d+\.\s+([\s\S]*)$/;
const QUOTE = /^&gt;\s+([\s\S]*)$/; // a typed ">" is escaped to "&gt;" in stored HTML

export function upgradeLegacyMarkdown(html: string): string {
  // Phase 1: rewrite each leading-marker paragraph into a tagged token. List and
  // quote items get sentinel tags so consecutive ones can be grouped afterwards.
  let out = html.replace(/<p>([\s\S]*?)<\/p>/g, (full, inner: string) => {
    const lead = inner.replace(/^\s+/, "");
    let m: RegExpMatchArray | null;

    if (HR.test(lead)) return "<hr>";
    if ((m = lead.match(HEADING))) {
      const level = m[1].length;
      return `<h${level}>${m[2].trim()}</h${level}>`;
    }
    if ((m = lead.match(BULLET))) return `<!ul>${m[1].trim()}<!/ul>`;
    if ((m = lead.match(ORDERED))) return `<!ol>${m[1].trim()}<!/ol>`;
    if ((m = lead.match(QUOTE))) return `<!bq>${m[1].trim()}<!/bq>`;
    return full;
  });

  // Phase 2: collapse runs of adjacent sentinels into real list/quote elements.
  out = out.replace(
    /(?:<!ul>[\s\S]*?<!\/ul>)+/g,
    (run) => "<ul>" + run.replace(/<!ul>/g, "<li>").replace(/<!\/ul>/g, "</li>") + "</ul>",
  );
  out = out.replace(
    /(?:<!ol>[\s\S]*?<!\/ol>)+/g,
    (run) => "<ol>" + run.replace(/<!ol>/g, "<li>").replace(/<!\/ol>/g, "</li>") + "</ol>",
  );
  out = out.replace(
    /(?:<!bq>[\s\S]*?<!\/bq>)+/g,
    (run) =>
      "<blockquote>" + run.replace(/<!bq>/g, "<p>").replace(/<!\/bq>/g, "</p>") + "</blockquote>",
  );

  return out;
}
