// SPDX-License-Identifier: AGPL-3.0-or-later
import { Extension } from "@tiptap/core";

// The filename a code block can carry, and the languages the editor offers for
// one.
//
// A Markdown author has had both since fences learned `title=` (backend
// lib/markdown.ts); an author using the editor had neither, so the same post
// written in the GUI came out as an unlabelled grey box. This is the other half
// of that feature.
//
// The language itself needs nothing added: Tiptap's CodeBlock already has a
// `language` attribute and renders it as `class="language-x"` on the `<code>`,
// which is exactly what the reader reads (lib/highlight.ts). Only the filename
// is missing, and it is added as a global attribute rather than by swapping the
// node out — StarterKit keeps its CodeBlock, with its input rules and its
// triple-enter exit, and gains one attribute.

/**
 * Adds `title` to code blocks, rendered as `data-title` on the `<pre>`.
 *
 * That is where the reader looks for it, and where the backend sanitizer allows
 * it (lib/sanitize.ts) — so a block written here survives the round trip
 * through storage and federation identically to a Markdown fence's.
 */
export const CodeBlockTitle = Extension.create({
  name: "codeBlockTitle",

  addGlobalAttributes() {
    return [
      {
        types: ["codeBlock"],
        attributes: {
          title: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-title") || null,
            // Absent rather than empty when unset, so a block with no filename
            // stores no attribute at all.
            renderHTML: (attributes) =>
              attributes.title ? { "data-title": attributes.title } : {},
          },
        },
      },
    ];
  },
});
