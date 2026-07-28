// SPDX-License-Identifier: AGPL-3.0-or-later
import { assertEquals, assertStringIncludes } from "@std/assert";
import { renderMarkdown } from "@/lib/markdown.ts";

// `renderMarkdown` feeds author-written Markdown (the profile's custom section)
// into storage, and its output is rendered with {@html}. The security tests here
// matter as much as the ones in sanitize_test.ts: raw HTML is deliberately
// *parsed* rather than escaped, so the sanitizer is the only thing standing
// between an author's input and every reader's browser.

Deno.test("markdown: renders the common block elements", () => {
  const out = renderMarkdown(
    "# Title\n\n**bold** _em_ ~~gone~~\n\n- one\n- two\n\n> quote\n\n---\n",
  );
  assertStringIncludes(out, "<h1>Title</h1>");
  assertStringIncludes(out, "<strong>bold</strong>");
  assertStringIncludes(out, "<em>em</em>");
  assertStringIncludes(out, "<s>gone</s>");
  assertStringIncludes(out, "<li>one</li>");
  assertStringIncludes(out, "<blockquote>");
  assertStringIncludes(out, "<hr");
});

Deno.test("markdown: renders tables and fenced code", () => {
  const out = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nlet x;\n```\n");
  assertStringIncludes(out, "<table>");
  assertStringIncludes(out, "<th>a</th>");
  assertStringIncludes(out, "<td>1</td>");
  assertStringIncludes(out, `<code class="language-js">`);
});

Deno.test("markdown: task lists become inert Unicode boxes", () => {
  const out = renderMarkdown("- [ ] todo\n- [x] done\n");
  assertStringIncludes(out, "☐ todo");
  assertStringIncludes(out, "☑ done");
  // No form controls are introduced — the sanitizer would drop them anyway.
  assertEquals(out.includes("<input"), false);
});

Deno.test("markdown: bare URLs are linkified and hardened", () => {
  const out = renderMarkdown("see https://example.com for more");
  assertStringIncludes(out, `href="https://example.com"`);
  assertStringIncludes(out, `rel="noopener noreferrer nofollow"`);
});

Deno.test("markdown: keeps the layout HTML a custom section needs", () => {
  const out = renderMarkdown(
    `<div align="center"><b>hi</b></div>\n\n<details open><summary>More</summary>\n\nbody\n\n</details>`,
  );
  assertStringIncludes(out, `<div align="center">`);
  assertStringIncludes(out, "<details");
  assertStringIncludes(out, "<summary>More</summary>");
});

Deno.test("markdown: strips script tags embedded in the source", () => {
  const out = renderMarkdown("hello\n\n<script>alert('xss')</script>\n");
  assertStringIncludes(out, "hello");
  assertEquals(out.includes("<script"), false);
  assertEquals(out.includes("alert"), false);
});

Deno.test("markdown: strips event handlers and javascript: URLs", () => {
  const out = renderMarkdown(
    `<img src="https://x/y.png" onerror="alert(1)">\n\n[click](javascript:alert(1))`,
  );
  assertEquals(out.includes("onerror"), false);
  // markdown-it refuses to build the link at all, so the source survives as
  // literal text. What matters is that no navigable href carries the scheme.
  assertEquals(/href\s*=\s*"[^"]*javascript/i.test(out), false);
  assertEquals(out.includes("<a "), false);
});

Deno.test("markdown: strips inline styles", () => {
  const out = renderMarkdown(`<div style="position:fixed;inset:0">overlay</div>`);
  assertEquals(out.includes("style"), false);
  assertStringIncludes(out, "overlay");
});

Deno.test("markdown: empty and whitespace-only input render as empty", () => {
  assertEquals(renderMarkdown(""), "");
  assertEquals(renderMarkdown("   \n\n  "), "");
  assertEquals(renderMarkdown(null), "");
  assertEquals(renderMarkdown(undefined), "");
});
