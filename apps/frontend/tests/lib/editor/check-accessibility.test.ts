// SPDX-License-Identifier: AGPL-3.0-or-later
import { Editor, generateJSON } from "@tiptap/core";
import { afterEach, expect, test } from "vitest";
import { checkAccessibility } from "#lib/editor/check-accessibility.js";
import { extensions } from "#lib/editor/extensions.js";

let editor: Editor | undefined;
afterEach(() => editor?.destroy());

function check(html: string) {
  editor = new Editor({ extensions, content: generateJSON(html, extensions) });
  return checkAccessibility(editor.state.doc);
}

test("described and explicitly decorative images do not produce missing-alt prompts", () => {
  expect(check('<img src="/a.png" alt="A cat"><img src="/b.png" alt="">')).toEqual([]);
});

test("unreviewed and whitespace-only alternatives are located individually", () => {
  const issues = check('<img src="/a.png"><img src="/b.png" alt="  ">');
  expect(issues.map((issue) => [issue.code, issue.pos, issue.label])).toEqual([
    ["image-alt", 0, "image 1"],
    ["image-alt", 1, "image 2"],
  ]);
});

test("heading guidance recognizes the article title and nested sections", () => {
  expect(check("<h2>Section</h2><h3>Detail</h3><h2>Next</h2>")).toEqual([]);
  expect(check("<h1>Another title</h1><h3>Skipped level</h3><h2></h2>").map((issue) => issue.code)).toEqual([
    "heading-order",
    "heading-order",
    "heading-empty",
  ]);
});

test("a table without descriptions or headers offers both kinds of guidance", () => {
  expect(check("<table><tr><td>Data</td></tr></table>").map((issue) => issue.code)).toEqual([
    "table-headers",
    "table-caption",
  ]);
});

test("a captioned table with descriptive headers needs no structural prompts", () => {
  expect(
    check(
      "<table><caption>Sales</caption><tr><th>Month</th><th>Count</th></tr><tr><td>June</td><td>10</td></tr></table>",
    ),
  ).toEqual([]);
});

test("empty table headers are flagged for author review", () => {
  expect(check('<table aria-label="Sales"><tr><th></th></tr></table>').map((issue) => issue.code)).toEqual([
    "table-empty-header",
  ]);
});

test("ambiguous link text is a review prompt, not an automatic content rewrite", () => {
  expect(check('<p><a href="/report">Click here</a> <a href="/report">Read the sales report</a></p>')).toMatchObject([
    { code: "link-purpose", kind: "link", label: "link: Click here" },
  ]);
  expect(editor!.getHTML()).toContain("Click here");
});
