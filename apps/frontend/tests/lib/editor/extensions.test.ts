// SPDX-License-Identifier: AGPL-3.0-or-later
// The editor's extension set, run in a real Tiptap editor: what it emits is
// what gets stored, sanitized and federated, so the HTML round trip is the
// thing under test. Stored HTML is loaded the way Editor.svelte loads it:
// through generateJSON, not as a content string (which would be read as Markdown).
import { Editor, generateJSON } from "@tiptap/core";
import { afterEach, expect, test } from "vitest";
import { extensions } from "#lib/editor/extensions.js";
import { complexTableHtml } from "./transfer-fixtures";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function edit(content: string) {
  editor = new Editor({
    element: document.createElement("div"),
    extensions,
    content: content ? generateJSON(content, extensions) : "",
  });
  return editor;
}

test("a code block keeps its title as data-title, and an untitled one gets none", () => {
  const html = edit(
    '<pre data-title="main.ts"><code class="language-ts">let x = 1;</code></pre><pre><code>y</code></pre>',
  ).getHTML();
  expect(html).toContain('<pre data-title="main.ts"><code class="language-ts">let x = 1;</code></pre>');
  expect(html).toContain("<pre><code>y</code></pre>");
});

test("links open in a new tab without leaking the referrer, and never navigate on click", () => {
  const html = edit('<p><a href="https://example.com">x</a></p>').getHTML();
  expect(html).toContain('<a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com">x</a>');
});

test("headings go to h6, tables have no wrapper, images keep a chosen width", () => {
  const html = edit(
    '<h6>Six</h6><table><tbody><tr><td><p>c</p></td></tr></tbody></table><img src="/api/uploads/a.webp" width="50%">',
  ).getHTML();
  expect(html).toContain("<h6>Six</h6>");
  expect(html).toMatch(/^<h6>Six<\/h6><table/);
  expect(html).toContain('width="50%"');
  expect(html).toContain('class="rounded-card mx-auto my-6 max-w-full"');
});

test("a base64 image is not accepted into the document", () => {
  expect(edit('<img src="data:image/png;base64,AAAA">').getHTML()).not.toContain("data:image");
});

test("raw HTML inside pasted Markdown is not trusted", () => {
  const e = edit("");
  e.commands.setContent("**bold** <script>alert(1)</script>");
  expect(e.getHTML()).not.toContain("<script>");
  expect(e.getHTML()).toContain("<strong>bold</strong>");
});

test("editing preserves passage languages and accessible names", () => {
  const html = edit(
    '<p lang="fr" dir="ltr">Hello <span lang="de">world</span> <a href="/more" aria-label="Read the full report">More</a></p>',
  ).getHTML();
  expect(html).toContain('<p lang="fr" dir="ltr">');
  expect(html).toContain('<span lang="de">world</span>');
  expect(html).toContain('aria-label="Read the full report"');
});

test("editing preserves table descriptions and explicit header relationships", () => {
  const html = edit(
    '<table><caption>Sales</caption><tr><th id="region" scope="col"><p>Region</p></th></tr><tr><td headers="region"><p>North</p></td></tr></table>',
  ).getHTML();
  expect(html).toContain("<caption>Sales</caption>");
  expect(html).toContain('id="region"');
  expect(html).toContain('scope="col"');
  expect(html).toContain('headers="region"');
});

test("a table caption keeps the language and ID used by its accessible name", () => {
  const html = edit(
    '<table aria-labelledby="sales"><caption id="sales" lang="fr">Sales</caption><tr><th>Month</th></tr></table>',
  ).getHTML();
  expect(html).toContain('aria-labelledby="sales"');
  expect(html).toContain('<caption id="sales" lang="fr">Sales</caption>');
});

test("complex table HTML and JSON survive repeated editor round trips with resolvable references", () => {
  const first = edit(complexTableHtml);
  const json = first.getJSON();
  const html = first.getHTML();
  first.commands.setContent(json);
  expect(first.getHTML()).toBe(html);
  first.commands.setContent(generateJSON(html, extensions));
  expect(first.getJSON()).toEqual(json);
  const body = document.createElement("div");
  body.innerHTML = html;
  expect(body.querySelector("caption")).toHaveAttribute("lang", "fr");
  expect(body.querySelector("caption")).toHaveAttribute("dir", "ltr");
  expect(body.querySelector("#region")).toHaveAttribute("rowspan", "2");
  expect(body.querySelector("#totals")).toHaveAttribute("colspan", "2");
  expect(body.querySelector("#totals")).toHaveAttribute("scope", "colgroup");
  for (const element of body.querySelectorAll("[headers], [aria-labelledby], [aria-describedby]")) {
    for (const name of ["headers", "aria-labelledby", "aria-describedby"]) {
      for (const id of element.getAttribute(name)?.split(/\s+/) ?? []) {
        expect(body.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
      }
    }
  }
});
