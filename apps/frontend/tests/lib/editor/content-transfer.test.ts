// SPDX-License-Identifier: AGPL-3.0-or-later
import { Editor, generateJSON } from "@tiptap/core";
import { Slice } from "@tiptap/pm/model";
import { afterEach, expect, test } from "vitest";
import {
  fileTransferSlice,
  transferImageCount,
  transferLoss,
  preserveTransferBoundaries,
  rehostTransferImages,
} from "#lib/editor/content-transfer.js";
import { extensions } from "#lib/editor/extensions.js";

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
