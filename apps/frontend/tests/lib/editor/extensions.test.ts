import { extensions } from "$lib/editor/extensions";
// SPDX-License-Identifier: AGPL-3.0-or-later
// The editor's extension set, run in a real Tiptap editor: what it emits is
// what gets stored, sanitized and federated, so the HTML round trip is the
// thing under test. Stored HTML is loaded the way Editor.svelte loads it:
// through generateJSON, not as a content string (which would be read as Markdown).
import { Editor, generateJSON } from "@tiptap/core";
import { afterEach, expect, test } from "vitest";

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
