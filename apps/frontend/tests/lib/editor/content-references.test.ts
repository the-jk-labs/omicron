// SPDX-License-Identifier: AGPL-3.0-or-later
import { Editor, generateJSON } from "@tiptap/core";
import { DOMSerializer, Slice } from "@tiptap/pm/model";
import { afterEach, beforeEach, expect, test } from "vitest";
import { remapTransferIds, transferReferenceProblems } from "#lib/editor/content-references.js";
import { extensions } from "#lib/editor/extensions.js";
import { complexTableHtml } from "./transfer-fixtures";

let editor: Editor;
beforeEach(() => {
  editor = new Editor({ extensions });
});
afterEach(() => editor?.destroy());
function documentNode(html: string) {
  return editor.schema.nodeFromJSON(generateJSON(html, extensions));
}
function slice(html: string) {
  return new Slice(documentNode(html).content, 0, 0);
}
function htmlOf(content: Slice) {
  const element = document.createElement("div");
  element.append(DOMSerializer.fromSchema(editor.schema).serializeFragment(content.content));
  return element;
}

test("unique source IDs and references stay unchanged when the destination has no collision", () => {
  const source = slice('<img src="/chart.png" alt="Chart" aria-describedby="details"><p id="details">Details</p>');
  expect(remapTransferIds(source, documentNode("<p>Destination</p>"))).toBe(source);
});

test("colliding IDs and all bundled IDREF tokens are remapped without altering other attributes or openness", () => {
  const source = slice(
    '<img src="/chart.png" alt="Chart" title="Report" lang="en" width="50%" aria-labelledby="title" aria-describedby="details\tother"><p id="details">Details</p><p id="other">Other</p><h2 id="title">Title</h2>',
  );
  const open = new Slice(source.content, 0, 1);
  const original = JSON.stringify(open.toJSON());
  const result = remapTransferIds(open, documentNode('<p id="details">Existing</p><p id="title">Old title</p>'));
  expect([result.openStart, result.openEnd]).toEqual([0, 1]);
  expect(JSON.stringify(open.toJSON())).toBe(original);
  const body = htmlOf(result);
  expect(body.querySelector("img")).toHaveAttribute("aria-describedby", "details-copy\tother");
  expect(body.querySelector("img")).toHaveAttribute("aria-labelledby", "title-copy");
  expect(body.querySelector("img")).toHaveAttribute("alt", "Chart");
  expect(body.querySelector("img")).toHaveAttribute("width", "50%");
  expect(body.querySelector("img")).toHaveAttribute("title", "Report");
  expect(body.querySelector("#details-copy")).toHaveTextContent("Details");
  expect(body.querySelector("#title-copy")).toHaveTextContent("Title");
});

test("generated IDs avoid existing and incoming suffixes deterministically", () => {
  const source = slice(
    '<img src="/a.png" aria-describedby="details"><p id="details">New</p><p id="details-copy">Separate</p>',
  );
  const destination = documentNode('<p id="details">Old</p><p id="details-copy-2">Reserved</p>');
  const result = remapTransferIds(source, destination);
  expect(htmlOf(result).querySelector("img")).toHaveAttribute("aria-describedby", "details-copy-3");
  expect(htmlOf(result).querySelector("#details-copy")).toHaveTextContent("Separate");
  expect(remapTransferIds(source, destination).toJSON()).toEqual(result.toJSON());
});

test("caption IDs, row/column headers and the table's long description are remapped together", () => {
  const source = slice(complexTableHtml);
  const destination = documentNode(complexTableHtml);
  const result = remapTransferIds(source, destination);
  const body = htmlOf(result);
  expect(body.querySelector("table")).toHaveAttribute("aria-labelledby", "sales-caption-copy");
  expect(body.querySelector("table")).toHaveAttribute("aria-describedby", "sales-notes-copy");
  expect(body.querySelector("caption")).toHaveAttribute("id", "sales-caption-copy");
  expect(body.querySelector("caption")).toHaveAttribute("lang", "fr");
  expect(body.querySelector('[headers="north-copy count-copy"]')).toHaveTextContent("20");
  expect(body.querySelector("#totals-copy")).toHaveAttribute("colspan", "2");
  expect(transferReferenceProblems(destination, documentNode(complexTableHtml + body.innerHTML))).toEqual([]);
});

test("IDs on inline marks and encoded same-document fragment links follow their bundled target", () => {
  const source = slice(
    '<p><span id="notes:2026" lang="en">Details</span> <a href="#notes%3A2026" aria-describedby="notes:2026">Read</a></p>',
  );
  const result = remapTransferIds(source, documentNode('<p id="notes:2026">Existing</p>'));
  const body = htmlOf(result);
  expect(body.querySelector("span")).toHaveAttribute("id", "notes:2026-copy");
  expect(body.querySelector("a")).toHaveAttribute("href", "#notes%3A2026-copy");
  expect(body.querySelector("a")).toHaveAttribute("aria-describedby", "notes:2026-copy");
});

test("external URLs and references to surviving destination targets are not rewritten", () => {
  const source = slice('<p><a href="/article#details">Read</a></p><img src="/chart.png" aria-describedby="details">');
  const destination = documentNode('<p id="details">Existing description</p>');
  expect(remapTransferIds(source, destination)).toBe(source);
  expect(
    transferReferenceProblems(
      destination,
      documentNode('<p id="details">Existing description</p>' + htmlOf(source).innerHTML),
    ),
  ).toEqual([]);
});

test("duplicate source IDs are not guessed into distinct reference targets", () => {
  const source = slice('<p id="details">One</p><p id="details">Two</p><img src="/a.png" aria-describedby="details">');
  const destination = documentNode('<p id="details">Existing</p>');
  expect(remapTransferIds(source, destination)).toBe(source);
  expect(transferReferenceProblems(destination, documentNode(htmlOf(source).innerHTML))).toEqual([
    "duplicate ID: details",
    "ambiguous aria-describedby target: details",
  ]);
});

test.for(["aria-describedby", "aria-labelledby", "headers"])(
  "missing %s targets are detected in the actual result",
  (name) => {
    const before = documentNode('<p id="details">Details</p>');
    const after = documentNode(
      name === "headers"
        ? '<table><tr><td headers="details">Value</td></tr></table>'
        : `<img src="/chart.png" ${name}="details">`,
    );
    expect(transferReferenceProblems(before, after)).toContain(`missing ${name} target: details`);
  },
);

test("newly missing fragment links are detected, including encoded IDs and malformed escapes", () => {
  expect(
    transferReferenceProblems(
      documentNode("<p></p>"),
      documentNode('<p><a href="#notes%3A2026">Read</a><a href="#bad%ZZ">Other</a><a href="#">Top</a></p>'),
    ),
  ).toEqual(["missing href target: notes:2026", "missing href target: bad%ZZ"]);
});

test("unrelated pre-existing invalid relationships do not block insertion, but additional broken references do", () => {
  const before = documentNode('<img src="/one.png" aria-describedby="missing">');
  expect(
    transferReferenceProblems(before, documentNode('<img src="/one.png" aria-describedby="missing"><p>New text</p>')),
  ).toEqual([]);
  expect(
    transferReferenceProblems(
      before,
      documentNode('<img src="/one.png" aria-describedby="missing"><img src="/two.png" aria-describedby="missing">'),
    ),
  ).toEqual(["missing aria-describedby target: missing"]);
});

test("new content is checked independently when it replaces an identical pre-existing reference defect", () => {
  const before = documentNode('<img src="/old.png" aria-describedby="missing">');
  const incoming = slice('<img src="/new.png" aria-describedby="missing">');
  expect(transferReferenceProblems(before, documentNode(htmlOf(incoming).innerHTML), incoming)).toEqual([
    "missing aria-describedby target: missing",
  ]);
});
