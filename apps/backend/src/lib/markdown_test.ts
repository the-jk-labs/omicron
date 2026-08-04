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

Deno.test("markdown: URLs written with a scheme are linkified and hardened", () => {
  const out = renderMarkdown("see https://example.com for more");
  assertStringIncludes(out, `href="https://example.com"`);
  assertStringIncludes(out, `rel="noopener noreferrer nofollow"`);
});

Deno.test("markdown: a hostname mentioned in prose is not a link", () => {
  for (const source of ["your kofe.al username", "**kofe.al/@username**", "see www.kofe.al"]) {
    assertEquals(renderMarkdown(source).includes("<a "), false);
  }
});

Deno.test("markdown: a component name in prose survives as text", () => {
  const out = renderMarkdown(`Use <KofeAl username="you" isHoverable /> in your page.`);
  assertStringIncludes(out, "&lt;KofeAl");
  assertStringIncludes(out, "/&gt;");
  // The attribute is part of the text now, not markup for the sanitizer to eat.
  assertStringIncludes(out, `username="you"`);
});

Deno.test("markdown: renderable markup stays markup, whatever its case", () => {
  // A tag on the sanitizer's allowlist still renders — capitalised HTML is
  // legacy-valid and stays a tag.
  assertStringIncludes(renderMarkdown("<BR>after"), "<br />");
  assertStringIncludes(renderMarkdown("<TABLE><TR><TD>x</TD></TR></TABLE>"), "<table>");
});

Deno.test("markdown: a refused tag is shown as inert text, not live markup", () => {
  // A tag the sanitizer refuses reaches the reader as the text that was typed —
  // visible but escaped — instead of being parsed. What must never appear is a
  // live element, whatever the case it was written in.
  const iframe = renderMarkdown("Embed it in the <iframe> tag.");
  assertStringIncludes(iframe, "&lt;iframe&gt;");
  assertEquals(iframe.includes("<iframe"), false);

  const script = renderMarkdown("<SCRIPT>alert(1)</SCRIPT>");
  assertStringIncludes(script, "&lt;SCRIPT&gt;");
  assertEquals(script.toLowerCase().includes("<script"), false);
});

Deno.test("markdown: a refused tag in prose does not eat the rest of the post", () => {
  // The bug this guards: a bare `<iframe>` is a raw-text element, so left in the
  // stream it makes the sanitizer's parser swallow everything after it. Escaped
  // to text first, the sentence around it survives untouched.
  const out = renderMarkdown("Show it in the <iframe> tag, and **this** must survive.");
  assertStringIncludes(out, "&lt;iframe&gt;");
  assertStringIncludes(out, "<strong>this</strong> must survive");
});

Deno.test("markdown: character escapes render as the characters they name", () => {
  const out = renderMarkdown("It&apos;s 5 &lt; 7 &amp; done");
  assertStringIncludes(out, "It's");
  assertStringIncludes(out, "5 &lt; 7");
  assertEquals(out.includes("&amp;apos;"), false);
});

Deno.test("markdown: keeps the layout HTML a custom section needs", () => {
  const out = renderMarkdown(
    `<div align="center"><b>hi</b></div>\n\n<details open><summary>More</summary>\n\nbody\n\n</details>`,
  );
  assertStringIncludes(out, `<div align="center">`);
  assertStringIncludes(out, "<details");
  assertStringIncludes(out, "<summary>More</summary>");
});

Deno.test("markdown: a script tag in the source cannot become live markup", () => {
  const out = renderMarkdown("hello\n\n<script>alert('xss')</script>\n");
  assertStringIncludes(out, "hello");
  // Shown as inert, escaped text — never a live element the browser would run.
  assertStringIncludes(out, "&lt;script&gt;");
  assertEquals(out.includes("<script"), false);
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

Deno.test("markdown: inline and display maths render as MathML", () => {
  const inline = renderMarkdown("Einstein wrote $E = mc^2$ once.");
  assertStringIncludes(inline, "<math");
  assertStringIncludes(inline, "<msup><mi>c</mi><mn>2</mn></msup>");
  assertEquals(inline.includes("$"), false);

  const block = renderMarkdown("$$\\frac{a}{b}$$");
  assertStringIncludes(block, 'class="katex-block"');
  assertStringIncludes(block, '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">');
  assertStringIncludes(block, "<mfrac>");
});

Deno.test("markdown: maths survives the sanitizer with its layout attributes", () => {
  // MathML reaches the reader through `sanitizePostHtml` like everything else,
  // so the tags and the presentational attributes must both be on the allowlist
  // — a stripped `display` or `fence` is a formula rendered wrong.
  const out = renderMarkdown("$$\\left( \\sum_{i=1}^{n} x_i \\right)$$");
  assertStringIncludes(out, "<munderover>");
  assertStringIncludes(out, 'fence="true"');
  assertStringIncludes(out, 'display="block"');
});

Deno.test("markdown: maths cannot smuggle script through MathML", () => {
  const out = renderMarkdown(
    '<math><mtext onclick="alert(1)">x</mtext></math>\n\n' +
      '<math><maction actiontype="statusline">y</maction></math>',
  );
  assertEquals(/onclick/i.test(out), false);
  // `<maction>` is the one MathML element with behaviour attached. It never
  // survives as a live element — either stripped or, refused here, downgraded to
  // inert escaped text.
  assertEquals(/<maction/i.test(out), false);
  assertStringIncludes(out, "<mtext>x</mtext>");
});

Deno.test("markdown: a price is not a formula", () => {
  for (const source of ["It costs $5 and shipping is $6.", "Tiers: $10, $20, $30."]) {
    assertEquals(renderMarkdown(source).includes("<math"), false);
  }
});

Deno.test("markdown: an unparseable formula degrades to its source", () => {
  const out = renderMarkdown("broken $\\frac{1$");
  assertStringIncludes(out, "katex-error");
  assertEquals(out.includes("<math"), false);
});

Deno.test("markdown: underscores inside a formula are not emphasis", () => {
  // Two `_` in one line is markdown emphasis everywhere except inside maths,
  // where they are subscripts. The maths rule runs first, which is what keeps
  // `\Sigma_{ss} … k_{B}` out of an <em>.
  const out = renderMarkdown("$\\Sigma_{ss} \\ge k_{B}$");
  assertEquals(out.includes("<em>"), false);
  assertStringIncludes(out, "<msub>");
});

Deno.test("markdown: tables render with their alignment intact", () => {
  const out = renderMarkdown("| a | b |\n| :-- | --: |\n| 1 | 2 |");
  assertStringIncludes(out, "<table>");
  assertStringIncludes(out, "<thead>");
  assertStringIncludes(out, "<td");
  assertEquals(out.includes("|"), false);
});
