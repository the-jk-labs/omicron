// SPDX-License-Identifier: AGPL-3.0-or-later
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Markdown } from "tiptap-markdown";
import type { Extensions } from "@tiptap/core";

// Editor extensions live here so the feature set is configured in one place.
// StarterKit ships headings, bold, italic, strike, inline code, code blocks,
// lists, blockquote, and horizontal rules. The Markdown extension parses pasted
// Markdown into rich nodes (and keeps the typing shortcuts like `## `, `- `,
// `>` working), so authors can write in plain Markdown and have it render fully
// — both in the editor and the reader view.
export const extensions: Extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4, 5, 6] },
  }),
  Link.configure({
    openOnClick: false,
    autolink: true,
    HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
  }),
  Markdown.configure({
    html: false, // don't trust raw HTML embedded in Markdown
    linkify: true, // turn bare URLs into links
    breaks: true, // treat single newlines as <br>
    transformPastedText: true, // parse Markdown when pasting plain text
    transformCopiedText: false,
  }),
];