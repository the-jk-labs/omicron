// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Editor } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

export type TextMatch = { pos: number; end: number; label: string; alternative: "image" | "table" | null };

export function findText(doc: Node, query: string): TextMatch[] {
  if (!query) return [];
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
  const matches: TextMatch[] = [];
  const scan = (text: string, pos: number, alternative: TextMatch["alternative"]) => {
    for (const match of text.matchAll(pattern)) {
      matches.push({
        pos: alternative ? pos : pos + match.index,
        end: alternative ? pos : pos + match.index + match[0].length,
        label: alternative ? `${alternative === "image" ? "Image description" : "Table caption"}: ${text}` : text,
        alternative,
      });
    }
  };
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      let text = "";
      node.forEach((child) => (text += child.isText ? child.text : "\uFFFC".repeat(child.nodeSize)));
      scan(text, pos + 1, null);
    }
    if (node.type.name === "image" && typeof node.attrs.alt === "string") scan(node.attrs.alt, pos, "image");
    if (node.type.name === "table" && typeof node.attrs.caption === "string") scan(node.attrs.caption, pos, "table");
  });
  return matches;
}

export function documentElements(doc: Node) {
  const elements: { pos: number; label: string }[] = [];
  doc.descendants((node, pos) => {
    if (node.isText || node.type.name === "hardBreak") return;
    const kind =
      node.type.name === "heading"
        ? `Heading ${node.attrs.level}`
        : node.type.name.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`);
    const description = node.type.name === "image" ? node.attrs.alt || "undescribed or decorative" : node.textContent;
    elements.push({ pos, label: `${kind}: ${String(description).slice(0, 80) || "empty"}` });
  });
  return elements;
}

export function focusElement(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return;
  if (node.isAtom) editor.chain().focus().setNodeSelection(pos).run();
  else {
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(pos + 1))).scrollIntoView(),
    );
    editor.commands.focus();
  }
}
