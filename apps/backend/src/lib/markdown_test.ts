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

// ── Loose bold ──────────────────────────────────────────────────────────────

Deno.test("markdown: bold closes even when the marker is not flush", () => {
  // CommonMark leaves `**NestJS: **` as literal asterisks because of the space
  // before the closing marker. Writers produce this constantly.
  const out = renderMarkdown("**NestJS: **Saf NodeJS əvəzinə");
  assertStringIncludes(out, "<strong>NestJS: </strong>Saf NodeJS");
  assertEquals(out.includes("**"), false);
});

Deno.test("markdown: the space inside a loose pair is kept, not trimmed", () => {
  // The whole point: dropping it would run the two words together.
  const out = renderMarkdown("**Prisma: **rahat sorğu");
  assertStringIncludes(out, "<strong>Prisma: </strong>rahat");
  assertEquals(out.includes(">Prisma:</strong>rahat"), false);
});

Deno.test("markdown: a pair with only whitespace between it still bolds", () => {
  assertStringIncludes(renderMarkdown("Sadəcə **   ** olsa"), "<strong>   </strong>");
});

Deno.test("markdown: tight bold and an unpaired marker are unaffected", () => {
  assertStringIncludes(renderMarkdown("**tight** still works"), "<strong>tight</strong>");
  // Nothing to pair with — it stays exactly as typed.
  assertStringIncludes(renderMarkdown("unpaired ** marker"), "unpaired ** marker");
});

Deno.test("markdown: code keeps its asterisks", () => {
  // The rule runs after inline parsing, so a code span or fence is already its
  // own token and never a candidate.
  assertStringIncludes(renderMarkdown("a `**not bold **` b"), "<code>**not bold **</code>");
  assertStringIncludes(renderMarkdown("```\n**not bold **\n```"), "**not bold **");
});

// ── Fence titles ────────────────────────────────────────────────────────────

Deno.test("markdown: a fence carries its optional filename", () => {
  const out = renderMarkdown('```ts title="@/lib/name.ts"\nconst a = 1;\n```');
  assertStringIncludes(out, 'data-title="@/lib/name.ts"');
  // The language still lands where a highlighter looks for it.
  assertStringIncludes(out, 'class="language-ts"');
});

Deno.test("markdown: both quotings and both spellings of the title are accepted", () => {
  for (
    const info of [
      `ts title="a.ts"`,
      `ts title='a.ts'`,
      `ts filename="a.ts"`,
      `ts  title = "a.ts"`,
    ]
  ) {
    assertStringIncludes(renderMarkdown("```" + info + "\nx\n```"), 'data-title="a.ts"');
  }
});

Deno.test("markdown: a fence with no title gets no attribute", () => {
  for (const source of ["```ts\nx\n```", "```\nx\n```", '```ts title="   "\nx\n```']) {
    assertEquals(renderMarkdown(source).includes("data-title"), false);
  }
});

Deno.test("markdown: a title cannot inject an attribute", () => {
  // The title is escaped where it is produced, and the sanitizer is a second
  // gate behind that. Neither a quote nor a handler survives into the tag.
  const out = renderMarkdown(
    '```ts title="x" onmouseover="alert(1)"\nconst a = 1;\n```',
  );
  assertEquals(/onmouseover/i.test(out), false);
  assertStringIncludes(out, "<pre");
});

Deno.test("markdown: a pathological title is truncated rather than stored whole", () => {
  const out = renderMarkdown('```ts title="' + "a".repeat(500) + '"\nx\n```');
  const title = /data-title="(a*)"/.exec(out)?.[1] ?? "";
  assertEquals(title.length, 120);
});

Deno.test("markdown: empty and whitespace-only input render as empty", () => {
  assertEquals(renderMarkdown(""), "");
  assertEquals(renderMarkdown("   \n\n  "), "");
  assertEquals(renderMarkdown(null), "");
  assertEquals(renderMarkdown(undefined), "");
});
