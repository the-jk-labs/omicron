import type { Extensions } from "@tiptap/core";
import { Link } from "@tiptap/extension-link";
import { TableKit } from "@tiptap/extension-table";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { StarterKit } from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { CodeBlockTitle } from "./code-block";
import { ResizableImage } from "./resizable-image";

// Editor extensions live here so the feature set is configured in one place.
// StarterKit ships headings, bold, italic, strike, inline code, code blocks,
// lists, blockquote, and horizontal rules. The Markdown extension parses pasted
// Markdown into rich nodes (and keeps the typing shortcuts like `## `, `- `,
// `>` working), so authors can write in plain Markdown and have it render fully
// — both in the editor and the reader view.
export const extensions: Extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4, 5, 6] },
    // StarterKit v3 bundles Link, but we register our own below with custom
    // attributes (rel/target, no open-on-click), so disable the built-in one.
    link: false,
  }),
  Link.configure({
    openOnClick: false,
    autolink: true,
    HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
  }),
  // Inline images uploaded by the author, resizable by dragging a corner (see
  // resizable-image.ts). Base64 is disabled, so only the same-origin URLs we
  // serve get inserted and post HTML stays small and portable.
  ResizableImage.configure({
    allowBase64: false,
    HTMLAttributes: { class: "rounded-card mx-auto my-6 max-w-full" },
  }),
  // Lets a code block carry a filename, the way a Markdown fence's `title=`
  // does. The language is already StarterKit's; see ./code-block.ts.
  CodeBlockTitle,
  // Tables. The tags and the colspan/rowspan/scope attributes are already
  // through the backend sanitizer, so what the editor emits stores and
  // federates as-is.
  //
  // Not resizable, and no wrapper div. Both would only mislead: column widths
  // ride on inline `style`, which the sanitizer strips, and the reader lays
  // tables out full-width and automatic — so a column dragged narrower here
  // would publish exactly as wide as before.
  TableKit.configure({
    table: { resizable: false, renderWrapper: false },
  }),
  Markdown.configure({
    html: false, // don't trust raw HTML embedded in Markdown
    linkify: true, // turn bare URLs into links
    breaks: true, // treat single newlines as <br>
    transformPastedText: true, // parse Markdown when pasting plain text
    transformCopiedText: false,
  }),
];
