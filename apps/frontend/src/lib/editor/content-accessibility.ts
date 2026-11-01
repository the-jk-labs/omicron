// SPDX-License-Identifier: AGPL-3.0-or-later
import { Extension, Mark, mergeAttributes } from "@tiptap/core";
import { Table, TableView } from "@tiptap/extension-table";
import type { Node } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";

export const CONTENT_ATTRIBUTES = ["lang", "dir", "id", "aria-label", "aria-labelledby", "aria-describedby"];

export const ContentAccessibility = Extension.create({
  name: "contentAccessibility",
  addGlobalAttributes() {
    return [
      {
        types: [
          "paragraph",
          "heading",
          "blockquote",
          "bulletList",
          "orderedList",
          "listItem",
          "codeBlock",
          "image",
          "table",
          "tableRow",
          "tableHeader",
          "tableCell",
          "bold",
          "italic",
          "strike",
          "code",
          "link",
          "textLanguage",
        ],
        attributes: Object.fromEntries(CONTENT_ATTRIBUTES.map((name) => [name, { default: null }])),
      },
      {
        types: ["tableHeader", "tableCell"],
        attributes: { headers: { default: null } },
      },
      { types: ["tableHeader"], attributes: { scope: { default: null } } },
    ];
  },
});

export const TextLanguage = Mark.create({
  name: "textLanguage",
  parseHTML: () => CONTENT_ATTRIBUTES.map((name) => ({ tag: `span[${name}]` })),
  renderHTML: ({ HTMLAttributes }) => ["span", HTMLAttributes, 0],
});

class AccessibleTableView extends TableView {
  constructor(node: Node, cellMinWidth: number, view?: EditorView, attributes: Record<string, unknown> = {}) {
    super(node, cellMinWidth, view, attributes);
    this.syncAccessibility(node);
  }

  override update(node: Node) {
    if (!super.update(node)) return false;
    this.syncAccessibility(node);
    return true;
  }

  private syncAccessibility(node: Node) {
    for (const name of CONTENT_ATTRIBUTES) {
      if (typeof node.attrs[name] === "string") this.table.setAttribute(name, node.attrs[name]);
      else this.table.removeAttribute(name);
    }
    if (!node.attrs.caption) {
      this.table.caption?.remove();
      return;
    }
    const caption = this.table.caption ?? this.table.createCaption();
    // Captions are metadata, edited through Table accessibility rather than the row document.
    caption.setAttribute("contenteditable", "false");
    const text = String(node.attrs.caption);
    if (caption.textContent !== text) caption.textContent = text;
    for (const name of CONTENT_ATTRIBUTES) {
      const value = node.attrs.captionAttributes?.[name];
      if (typeof value === "string") caption.setAttribute(name, value);
      else caption.removeAttribute(name);
    }
  }
}

export const AccessibleTable = Table.extend({
  addOptions() {
    return { ...this.parent!(), View: AccessibleTableView };
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      caption: {
        default: null,
        parseHTML: (element) => element.querySelector(":scope > caption")?.textContent ?? null,
        renderHTML: () => ({}),
      },
      captionAttributes: {
        default: null,
        parseHTML: (element) => {
          const caption = element.querySelector(":scope > caption");
          return caption
            ? Object.fromEntries(
                [...caption.attributes]
                  .filter((attribute) => CONTENT_ATTRIBUTES.includes(attribute.name))
                  .map((attribute) => [attribute.name, attribute.value]),
              )
            : null;
        },
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "table",
        contentElement: (element) => {
          // Caption text is metadata, not an extra row in ProseMirror's table map.
          const table = element.cloneNode(true) as HTMLElement;
          table.querySelectorAll("caption").forEach((caption) => caption.remove());
          return table;
        },
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    const attributes = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes);
    const captionAttributes = Object.fromEntries(
      Object.entries(node.attrs.captionAttributes ?? {}).filter(
        ([name, value]) => CONTENT_ATTRIBUTES.includes(name) && typeof value === "string",
      ),
    );
    return node.attrs.caption
      ? ["table", attributes, ["caption", captionAttributes, node.attrs.caption], ["tbody", 0]]
      : ["table", attributes, ["tbody", 0]];
  },
});
