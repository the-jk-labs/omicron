// SPDX-License-Identifier: AGPL-3.0-or-later
import { Editor, generateJSON } from "@tiptap/core";
import { DOMParser as ProseMirrorParser, DOMSerializer, Slice } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import { afterEach, expect, test } from "vitest";
import {
  fileTransferSlice,
  transferImageCount,
  transferLoss,
  preserveTransferBoundaries,
  rehostTransferImages,
} from "#lib/editor/content-transfer.js";
import { extensions } from "#lib/editor/extensions.js";
import { complexTableHtml } from "./transfer-fixtures";

let editor: Editor;
afterEach(() => editor?.destroy());
function parsed(html: string) {
  editor = new Editor({ extensions, content: generateJSON(html, extensions) });
  return new Slice(editor.state.doc.content, 0, 0);
}

test("rehosting changes only image sources and retains open slice boundaries and metadata", () => {
  const slice = parsed('<p lang="fr">Before<img src="/one.png" alt="One"></p><img src="/two.png" alt="" dir="rtl">');
  const openSlice = new Slice(slice.content, 1, 0);
  const original = JSON.stringify(openSlice.toJSON());
  const result = rehostTransferImages(openSlice, ["/new-one.webp", "/new-two.webp"]);
  expect(result.openStart).toBe(1);
  expect(result.openEnd).toBe(0);
  expect(transferImageCount(result)).toBe(2);
  expect(JSON.stringify(result.toJSON())).toBe(
    original.replace("/one.png", "/new-one.webp").replace("/two.png", "/new-two.webp"),
  );
  expect(JSON.stringify(openSlice.toJSON())).toBe(original);
});

test("mismatched file counts cannot partially rewrite a clipboard slice", () => {
  const slice = parsed('<img src="/one.png" alt="One">');
  expect(() => rehostTransferImages(slice, [])).toThrow("does not match");
  expect(() => rehostTransferImages(slice, ["/a.png", "/b.png"])).toThrow("does not match");
});

test("loss checking compares the actual parsed clipboard slice", () => {
  const html = '<figure><img src="/one.png" alt="One"><figcaption lang="fr">Caption</figcaption></figure>';
  expect(transferLoss(html, parsed(html), editor.schema)).toContain("element: figcaption");
});

test("source block metadata and heading semantics cannot be dropped by open-slice joins", () => {
  let slice = parsed('<p lang="fr">Bonjour</p>');
  expect(preserveTransferBoundaries(new Slice(slice.content, 1, 1)).openStart).toBe(0);
  editor.destroy();
  slice = parsed("<h2>Heading</h2>");
  expect(preserveTransferBoundaries(new Slice(slice.content, 1, 1)).openEnd).toBe(0);
});

test("plain paragraphs keep normal inline paste behavior", () => {
  const slice = parsed("<p>Plain text</p>");
  const open = new Slice(slice.content, 1, 1);
  expect(preserveTransferBoundaries(open)).toBe(open);
});

test("file-only transfers create ordered image placeholders without invented alternatives", () => {
  parsed("<p></p>");
  const slice = fileTransferSlice(editor.schema, 2);
  expect(transferImageCount(slice)).toBe(2);
  expect(slice.content.childCount).toBe(4);
  expect(slice.content.child(0).attrs.alt).toBeNull();
  expect(slice.content.child(2).attrs.alt).toBeNull();
  expect(slice.content.child(1).type.name).toBe("paragraph");
  expect(fileTransferSlice(editor.schema, 0).content.size).toBe(0);
});

test.for([false, true])(
  "a real partial text selection keeps inline language and link attributes (backward: %s)",
  (backward) => {
    parsed(
      '<p>Before <span lang="fr" dir="ltr"><a href="/details" aria-label="Read details">Bonjour</a></span> after</p>',
    );
    const selection = TextSelection.create(editor.state.doc, backward ? 15 : 8, backward ? 8 : 15);
    expect(selection.content().openStart).toBe(1);
    const slice = preserveTransferBoundaries(selection.content());
    expect(slice.openStart).toBe(1);
    expect(slice.content.textBetween(0, slice.content.size)).toBe("Bonjour");
    expect(slice.content.firstChild?.firstChild?.marks.map((mark) => [mark.type.name, mark.attrs])).toEqual(
      expect.arrayContaining([
        ["link", expect.objectContaining({ href: "/details", "aria-label": "Read details" })],
        ["textLanguage", expect.objectContaining({ lang: "fr", dir: "ltr" })],
      ]),
    );
  },
);

test("a real partial block-language selection closes boundaries without widening the selected text", () => {
  parsed('<p lang="fr" dir="ltr">Before Bonjour after</p>');
  const selection = TextSelection.create(editor.state.doc, 8, 15);
  const slice = preserveTransferBoundaries(selection.content());
  expect([slice.openStart, slice.openEnd]).toEqual([0, 0]);
  expect(slice.content.firstChild?.attrs).toMatchObject({ lang: "fr", dir: "ltr" });
  expect(slice.content.firstChild?.textContent).toBe("Bonjour");
});

test("a parsed complex table slice retains spans, caption metadata and explicit header references", () => {
  parsed("");
  const source = document.createElement("div");
  source.innerHTML = complexTableHtml;
  const slice = ProseMirrorParser.fromSchema(editor.schema).parseSlice(source);
  expect(transferLoss(complexTableHtml, slice, editor.schema)).toEqual([]);
  const closed = preserveTransferBoundaries(slice);
  expect([closed.openStart, closed.openEnd]).toEqual([0, 0]);
  const table = closed.content.firstChild!;
  expect(TableMap.get(table).problems).toBeNull();
  expect([TableMap.get(table).width, TableMap.get(table).height]).toEqual([3, 3]);
  expect(table.attrs).toMatchObject({
    caption: "Sales by region",
    captionAttributes: { id: "sales-caption", lang: "fr", dir: "ltr" },
    "aria-labelledby": "sales-caption",
    "aria-describedby": "sales-notes",
  });
  expect(table.child(0).child(0).attrs).toMatchObject({ id: "region", scope: "col", rowspan: 2 });
  expect(table.child(0).child(1).attrs).toMatchObject({ id: "totals", scope: "colgroup", colspan: 2 });
  expect(table.child(2).child(2).attrs.headers).toBe("north count");
});

test("a real rectangular cell selection retains the selected cells' own metadata", () => {
  parsed(complexTableHtml);
  const table = editor.state.doc.firstChild!;
  const map = TableMap.get(table);
  const selection = CellSelection.create(editor.state.doc, 1 + map.map[7], 1 + map.map[8]);
  const slice = selection.content();
  expect(selection.isRowSelection()).toBe(false);
  expect([slice.openStart, slice.openEnd]).toEqual([1, 1]);
  expect(slice.content.firstChild?.type.name).toBe("tableRow");
  expect(slice.content.firstChild?.childCount).toBe(2);
  expect(slice.content.firstChild?.child(0).attrs.headers).toBe("north year");
  expect(slice.content.firstChild?.child(1).attrs.headers).toBe("north count");
  expect(slice.content.textBetween(0, slice.content.size, "|")).toBe("2026|20");
});

test.for([
  '<table><caption>Sales <span lang="fr">annuelles</span></caption><tr><td>20</td></tr></table>',
  "<table><caption>Sales<br>2026</caption><tr><td>20</td></tr></table>",
  "<table><caption><strong>Sales</strong></caption><tr><td>20</td></tr></table>",
])("rich caption simplification is detected against the actual parsed slice: %s", (html) => {
  expect(transferLoss(html, parsed(html), editor.schema)).not.toEqual([]);
});

test("nested-table caption removal is detected rather than silently accepted", () => {
  const html =
    '<table><caption>Outer</caption><tr><td><table><caption lang="fr">Inner</caption><tr><td>Value</td></tr></table></td></tr></table>';
  expect(transferLoss(html, parsed(html), editor.schema)).toEqual(
    expect.arrayContaining(["element: caption", "caption lang: fr", "text content"]),
  );
});

test("rehosting nested images preserves their distinct descriptions and ID references in document order", () => {
  const slice = parsed(
    '<table><tr><td><img src="/one.png" alt="First" aria-describedby="details"></td></tr></table><p id="details">Details</p><blockquote><img src="/two.png" alt="" lang="fr"></blockquote>',
  );
  const original = slice.toJSON();
  const changed = rehostTransferImages(slice, ["/first.webp", "/second.webp"]);
  expect(transferImageCount(changed)).toBe(2);
  expect(changed.toJSON()).toEqual(
    JSON.parse(JSON.stringify(original).replace("/one.png", "/first.webp").replace("/two.png", "/second.webp")),
  );
  const container = document.createElement("div");
  container.append(DOMSerializer.fromSchema(editor.schema).serializeFragment(changed.content));
  expect(container.querySelector('img[aria-describedby="details"]')).toHaveAttribute("alt", "First");
  expect(container.querySelector("#details")).toHaveTextContent("Details");
  expect(slice.toJSON()).toEqual(original);
});
