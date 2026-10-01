// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { renderMarkdown } from "@/lib/markdown.ts";

// `renderMarkdown` feeds author-written Markdown (the profile's custom section)
// into storage, and its output is rendered with {@html}. The security tests here
// matter as much as the ones in sanitize_test.ts: raw HTML is deliberately
// *parsed* rather than escaped, so the sanitizer is the only thing standing
// between an author's input and every reader's browser.

test("markdown: renders the common block elements", () => {
  const out = renderMarkdown("# Title\n\n**bold** _em_ ~~gone~~\n\n- one\n- two\n\n> quote\n\n---\n");
  expect(out).toContain("<h1>Title</h1>");
  expect(out).toContain("<strong>bold</strong>");
  expect(out).toContain("<em>em</em>");
  expect(out).toContain("<s>gone</s>");
  expect(out).toContain("<li>one</li>");
  expect(out).toContain("<blockquote>");
  expect(out).toContain("<hr");
});

test("markdown: renders tables and fenced code", () => {
  const out = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nlet x;\n```\n");
  expect(out).toContain("<table>");
  expect(out).toContain("<th>a</th>");
  expect(out).toContain("<td>1</td>");
  expect(out).toContain(`<code class="language-js">`);
});

test("markdown: task lists become inert Unicode boxes", () => {
  const out = renderMarkdown("- [ ] todo\n- [x] done\n");
  expect(out).toContain("☐ todo");
  expect(out).toContain("☑ done");
  // No form controls are introduced — the sanitizer would drop them anyway.
  expect(out.includes("<input")).toBe(false);
});

test("markdown: URLs written with a scheme are linkified and hardened", () => {
  const out = renderMarkdown("see https://example.com for more");
  expect(out).toContain(`href="https://example.com"`);
  expect(out).toContain(`rel="noopener noreferrer nofollow"`);
});

test("markdown: a hostname mentioned in prose is not a link", () => {
  for (const source of ["your kofe.al username", "**kofe.al/@username**", "see www.kofe.al"]) {
    expect(renderMarkdown(source).includes("<a ")).toBe(false);
  }
});

test("markdown: a component name in prose survives as text", () => {
  const out = renderMarkdown(`Use <KofeAl username="you" isHoverable /> in your page.`);
  expect(out).toContain("&lt;KofeAl");
  expect(out).toContain("/&gt;");
  // The attribute is part of the text now, not markup for the sanitizer to eat.
  expect(out).toContain(`username="you"`);
});

test("markdown: renderable markup stays markup, whatever its case", () => {
  // A tag on the sanitizer's allowlist still renders — capitalised HTML is
  // legacy-valid and stays a tag.
  expect(renderMarkdown("<BR>after")).toContain("<br />");
  expect(renderMarkdown("<TABLE><TR><TD>x</TD></TR></TABLE>")).toContain("<table>");
});

test("markdown: a refused tag is shown as inert text, not live markup", () => {
  // A tag the sanitizer refuses reaches the reader as the text that was typed —
  // visible but escaped — instead of being parsed. What must never appear is a
  // live element, whatever the case it was written in.
  const iframe = renderMarkdown("Embed it in the <iframe> tag.");
  expect(iframe).toContain("&lt;iframe&gt;");
  expect(iframe.includes("<iframe")).toBe(false);

  const script = renderMarkdown("<SCRIPT>alert(1)</SCRIPT>");
  expect(script).toContain("&lt;SCRIPT&gt;");
  expect(script.toLowerCase().includes("<script")).toBe(false);
});

test("markdown: a refused tag in prose does not eat the rest of the post", () => {
  // The bug this guards: a bare `<iframe>` is a raw-text element, so left in the
  // stream it makes the sanitizer's parser swallow everything after it. Escaped
  // to text first, the sentence around it survives untouched.
  const out = renderMarkdown("Show it in the <iframe> tag, and **this** must survive.");
  expect(out).toContain("&lt;iframe&gt;");
  expect(out).toContain("<strong>this</strong> must survive");
});

test("markdown: character escapes render as the characters they name", () => {
  const out = renderMarkdown("It&apos;s 5 &lt; 7 &amp; done");
  expect(out).toContain("It's");
  expect(out).toContain("5 &lt; 7");
  expect(out.includes("&amp;apos;")).toBe(false);
});

test("markdown: keeps the layout HTML a custom section needs", () => {
  const out = renderMarkdown(
    `<div align="center"><b>hi</b></div>\n\n<details open><summary>More</summary>\n\nbody\n\n</details>`,
  );
  expect(out).toContain(`<div align="center">`);
  expect(out).toContain("<details");
  expect(out).toContain("<summary>More</summary>");
});

test("markdown: a script tag in the source cannot become live markup", () => {
  const out = renderMarkdown("hello\n\n<script>alert('xss')</script>\n");
  expect(out).toContain("hello");
  // Shown as inert, escaped text — never a live element the browser would run.
  expect(out).toContain("&lt;script&gt;");
  expect(out.includes("<script")).toBe(false);
});

test("markdown: strips event handlers and javascript: URLs", () => {
  const out = renderMarkdown(`<img src="https://x/y.png" onerror="alert(1)">\n\n[click](javascript:alert(1))`);
  expect(out.includes("onerror")).toBe(false);
  // markdown-it refuses to build the link at all, so the source survives as
  // literal text. What matters is that no navigable href carries the scheme.
  expect(/href\s*=\s*"[^"]*javascript/i.test(out)).toBe(false);
  expect(out.includes("<a ")).toBe(false);
});

test("markdown: strips inline styles", () => {
  const out = renderMarkdown(`<div style="position:fixed;inset:0">overlay</div>`);
  expect(out.includes("style")).toBe(false);
  expect(out).toContain("overlay");
});

// ── Loose bold ──────────────────────────────────────────────────────────────

test("markdown: bold closes even when the marker is not flush", () => {
  // CommonMark leaves `**NestJS: **` as literal asterisks because of the space
  // before the closing marker. Writers produce this constantly.
  const out = renderMarkdown("**NestJS: **Saf NodeJS əvəzinə");
  expect(out).toContain("<strong>NestJS: </strong>Saf NodeJS");
  expect(out.includes("**")).toBe(false);
});

test("markdown: the space inside a loose pair is kept, not trimmed", () => {
  // The whole point: dropping it would run the two words together.
  const out = renderMarkdown("**Prisma: **rahat sorğu");
  expect(out).toContain("<strong>Prisma: </strong>rahat");
  expect(out.includes(">Prisma:</strong>rahat")).toBe(false);
});

test("markdown: a pair with only whitespace between it still bolds", () => {
  expect(renderMarkdown("Sadəcə **   ** olsa")).toContain("<strong>   </strong>");
});

test("markdown: tight bold and an unpaired marker are unaffected", () => {
  expect(renderMarkdown("**tight** still works")).toContain("<strong>tight</strong>");
  // Nothing to pair with — it stays exactly as typed.
  expect(renderMarkdown("unpaired ** marker")).toContain("unpaired ** marker");
});

test("markdown: code keeps its asterisks", () => {
  // The rule runs after inline parsing, so a code span or fence is already its
  // own token and never a candidate.
  expect(renderMarkdown("a `**not bold **` b")).toContain("<code>**not bold **</code>");
  expect(renderMarkdown("```\n**not bold **\n```")).toContain("**not bold **");
});

// ── The footnote star inside bold ───────────────────────────────────────────

test("markdown: a footnote star inside bold stays where it was typed", () => {
  // CommonMark closes the `**` opener against the single `*`, which turns the
  // bold into nested italics and drops the star at the end of the sentence:
  // `<em><em>zero</em> server cost,</em>*`.
  const out = renderMarkdown("It also means **zero* server cost,** the server just returns.");
  expect(out).toContain("<strong>zero* server cost,</strong>");
  expect(out.includes("<em>")).toBe(false);
});

test("markdown: an escaped star renders the same as a bare one", () => {
  // The escaped form is what an author writes; the bare one is what survives a
  // CMS. Both are the same sentence, so both must read the same.
  const escaped = renderMarkdown(String.raw`**zero\* server cost,**`);
  expect(escaped).toBe(renderMarkdown("**zero* server cost,**"));
  expect(escaped).toContain("<strong>zero* server cost,</strong>");
});

test("markdown: genuine italics inside bold still nest", () => {
  // The single closer has a single opener to pair with here, so nothing is
  // reinterpreted — this is the case the rule must not break.
  expect(renderMarkdown("**a *b* c**")).toContain("<strong>a <em>b</em> c</strong>");
  // And the same with the two closers written as one `***` run.
  expect(renderMarkdown("**a *b***")).toContain("<strong>a <em>b</em></strong>");
  expect(renderMarkdown("*a **b** c*")).toContain("<em>a <strong>b</strong> c</em>");
});

test("markdown: an ordinary star outside bold is untouched", () => {
  expect(renderMarkdown("**bold** and a star* here")).toContain("and a star* here");
  expect(renderMarkdown("2 * 3 * 4")).toContain("2 * 3 * 4");
  expect(renderMarkdown("*italic* alone")).toContain("<em>italic</em> alone");
});

test("markdown: the star is repaired inside a link's own inline run", () => {
  // Link content carries its own delimiter list, which the rule has to walk too.
  const out = renderMarkdown("[**zero* cost**](https://kofe.al)");
  expect(out).toContain("<strong>zero* cost</strong>");
});

// ── Fence titles ────────────────────────────────────────────────────────────

test("markdown: a fence carries its optional filename", () => {
  const out = renderMarkdown('```ts title="@/lib/name.ts"\nconst a = 1;\n```');
  expect(out).toContain('data-title="@/lib/name.ts"');
  // The language still lands where a highlighter looks for it.
  expect(out).toContain('class="language-ts"');
});

test("markdown: both quotings and both spellings of the title are accepted", () => {
  for (const info of [`ts title="a.ts"`, `ts title='a.ts'`, `ts filename="a.ts"`, `ts  title = "a.ts"`]) {
    expect(renderMarkdown("```" + info + "\nx\n```")).toContain('data-title="a.ts"');
  }
});

test("markdown: a fence with no title gets no attribute", () => {
  for (const source of ["```ts\nx\n```", "```\nx\n```", '```ts title="   "\nx\n```']) {
    expect(renderMarkdown(source).includes("data-title")).toBe(false);
  }
});

test("markdown: a title cannot inject an attribute", () => {
  // The title is escaped where it is produced, and the sanitizer is a second
  // gate behind that. Neither a quote nor a handler survives into the tag.
  const out = renderMarkdown('```ts title="x" onmouseover="alert(1)"\nconst a = 1;\n```');
  expect(/onmouseover/i.test(out)).toBe(false);
  expect(out).toContain("<pre");
});

test("markdown: a pathological title is truncated rather than stored whole", () => {
  const out = renderMarkdown('```ts title="' + "a".repeat(500) + '"\nx\n```');
  const title = /data-title="(a*)"/.exec(out)?.[1] ?? "";
  expect(title.length).toBe(120);
});

test("markdown: empty and whitespace-only input render as empty", () => {
  expect(renderMarkdown("")).toBe("");
  expect(renderMarkdown("   \n\n  ")).toBe("");
  expect(renderMarkdown(null)).toBe("");
  expect(renderMarkdown(undefined)).toBe("");
});

test("markdown: inline and display maths render as MathML", () => {
  const inline = renderMarkdown("Einstein wrote $E = mc^2$ once.");
  expect(inline).toContain("<math");
  expect(inline).toContain("<msup><mi>c</mi><mn>2</mn></msup>");
  expect(inline.includes("$")).toBe(false);

  const block = renderMarkdown("$$\\frac{a}{b}$$");
  expect(block).toContain('class="katex-block"');
  expect(block).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">');
  expect(block).toContain("<mfrac>");
});

test("markdown: maths survives the sanitizer with its layout attributes", () => {
  // MathML reaches the reader through `sanitizePostHtml` like everything else,
  // so the tags and the presentational attributes must both be on the allowlist
  // — a stripped `display` or `fence` is a formula rendered wrong.
  const out = renderMarkdown("$$\\left( \\sum_{i=1}^{n} x_i \\right)$$");
  expect(out).toContain("<munderover>");
  expect(out).toContain('fence="true"');
  expect(out).toContain('display="block"');
});

test("markdown: maths cannot smuggle script through MathML", () => {
  const out = renderMarkdown(
    '<math><mtext onclick="alert(1)">x</mtext></math>\n\n' +
      '<math><maction actiontype="statusline">y</maction></math>',
  );
  expect(/onclick/i.test(out)).toBe(false);
  // `<maction>` is the one MathML element with behaviour attached. It never
  // survives as a live element — either stripped or, refused here, downgraded to
  // inert escaped text.
  expect(/<maction/i.test(out)).toBe(false);
  expect(out).toContain("<mtext>x</mtext>");
});

test("markdown: a price is not a formula", () => {
  for (const source of ["It costs $5 and shipping is $6.", "Tiers: $10, $20, $30."]) {
    expect(renderMarkdown(source).includes("<math")).toBe(false);
  }
});

test("markdown: an unparseable formula degrades to its source", () => {
  const out = renderMarkdown("broken $\\frac{1$");
  expect(out).toContain("katex-error");
  expect(out.includes("<math")).toBe(false);
});

test("markdown: underscores inside a formula are not emphasis", () => {
  // Two `_` in one line is markdown emphasis everywhere except inside maths,
  // where they are subscripts. The maths rule runs first, which is what keeps
  // `\Sigma_{ss} … k_{B}` out of an <em>.
  const out = renderMarkdown("$\\Sigma_{ss} \\ge k_{B}$");
  expect(out.includes("<em>")).toBe(false);
  expect(out).toContain("<msub>");
});

test("markdown: tables render with their alignment intact", () => {
  const out = renderMarkdown("| a | b |\n| :-- | --: |\n| 1 | 2 |");
  expect(out).toContain("<table>");
  expect(out).toContain("<thead>");
  expect(out).toContain("<td");
  expect(out.includes("|")).toBe(false);
});
