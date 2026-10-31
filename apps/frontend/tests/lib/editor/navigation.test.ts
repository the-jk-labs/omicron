// SPDX-License-Identifier: AGPL-3.0-or-later
import { Editor, generateJSON } from "@tiptap/core";
import { afterEach, expect, test } from "vitest";
import { extensions } from "#lib/editor/extensions.js";
import { documentElements, findText } from "#lib/editor/navigation.js";

let editor: Editor;
afterEach(() => editor?.destroy());
function doc(html: string) {
  editor = new Editor({ extensions, content: generateJSON(html, extensions) });
  return editor.state.doc;
}

test("find matches across formatting boundaries without losing document positions", () => {
  const document = doc("<p>Hello <strong>world</strong>. Hello world.</p>");
  const matches = findText(document, "HELLO WORLD");
  expect(matches).toHaveLength(2);
  for (const match of matches) expect(document.textBetween(match.pos, match.end)).toBe("Hello world");
});

test("search queries are literal and an empty query has no results", () => {
  const document = doc("<p>a.b [x] aab</p>");
  expect(findText(document, "a.b")).toHaveLength(1);
  expect(findText(document, "[x]")).toHaveLength(1);
  expect(findText(document, "")).toEqual([]);
  expect(findText(document, "missing")).toEqual([]);
});

test("search includes alternatives and captions as well as visible editable text", () => {
  const matches = findText(
    doc('<img src="/a.png" alt="Sales graph"><table><caption>Sales</caption><tr><th>Sales</th></tr></table>'),
    "Sales",
  );
  expect(matches.map((match) => match.alternative)).toEqual(["image", "table", null]);
});

test("navigation exposes headings, list structure, tables, and non-text nodes", () => {
  const elements = documentElements(doc('<h2>Section</h2><ul><li><p>Item</p></li></ul><img src="/a.png" alt="Graph">'));
  expect(elements.map((element) => element.label)).toEqual([
    "Heading 2: Section",
    "bullet list: Item",
    "list item: Item",
    "paragraph: Item",
    "image: Graph",
  ]);
  expect(new Set(elements.map((element) => element.pos)).size).toBe(elements.length);
});
