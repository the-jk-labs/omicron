// SPDX-License-Identifier: AGPL-3.0-or-later
import { assertEquals, assertStringIncludes } from "@std/assert";
import { upgradeLegacyMath } from "@/lib/legacyMath.ts";

// What these guard is a one-way edit to stored rows: the transform runs over
// every post on an instance and overwrites what it changes. Leaving a formula
// alone is always acceptable; mangling a paragraph that was never maths is not.

/** The TeX KaTeX recorded for a formula, so a test can assert on the source. */
function annotation(html: string): string {
  return /<annotation[^>]*>([\s\S]*?)<\/annotation>/.exec(html)?.[1].trim() ?? "";
}

Deno.test("legacy maths: a display formula becomes a rendered block", () => {
  const out = upgradeLegacyMath("<p>$$\\frac{a}{b}$$</p>");
  assertStringIncludes(out, '<p class="katex-block">');
  assertStringIncludes(out, 'display="block"');
  assertStringIncludes(out, "<mfrac>");
  assertEquals(out.includes("$"), false);
});

Deno.test("legacy maths: an inline formula is rendered in place", () => {
  const out = upgradeLegacyMath("<p>risk $\\varepsilon$ here</p>");
  assertStringIncludes(out, 'risk <span class="katex">');
  assertStringIncludes(out, "here</p>");
  assertEquals(out.includes("katex-block"), false);
});

Deno.test("legacy maths: subscripts stolen by emphasis are given back", () => {
  // The reason this file exists. Markdown paired the two `_` of the subscripts,
  // so the stored HTML has an <em> where the formula had underscores.
  const out = upgradeLegacyMath(
    "<p>$$\\dot{\\Sigma}<em>{\\mathrm{ss}} \\ge \\frac{k</em>{\\mathrm{B}}}{\\tau}$$</p>",
  );
  assertEquals(
    annotation(out),
    "\\dot{\\Sigma}_{\\mathrm{ss}} \\ge \\frac{k_{\\mathrm{B}}}{\\tau}",
  );
  assertEquals(out.includes("<em>"), false);
});

Deno.test("legacy maths: a multi-line block keeps its line breaks", () => {
  // `breaks: true` turned the newlines inside the block into <br>.
  const out = upgradeLegacyMath("<p>$$a = \\frac{1}{2}<br>+ \\ln b$$</p>");
  assertEquals(annotation(out), "a = \\frac{1}{2}\n+ \\ln b");
});

Deno.test("legacy maths: money is left exactly as it was", () => {
  for (
    const html of [
      "<p>It costs $5 and shipping is $6.</p>",
      "<p>Tiers: $10, $20, $30 per seat.</p>",
    ]
  ) {
    assertEquals(upgradeLegacyMath(html), html);
  }
});

Deno.test("legacy maths: code is never touched", () => {
  const html = "<pre><code>echo $HOME_{x} $PATH</code></pre><p>and <code>$a_{1}$</code></p>";
  assertEquals(upgradeLegacyMath(html), html);
});

Deno.test("legacy maths: markup we cannot account for is left alone", () => {
  // A link inside the candidate means the `$…$` was never one formula. Rendering
  // it would swallow the anchor, so the paragraph stays as it is.
  const html = '<p>$a_{1} <a href="https://x.example">x</a> b_{2}$</p>';
  assertEquals(upgradeLegacyMath(html), html);
});

Deno.test("legacy maths: a post with no dollars is returned untouched", () => {
  const html = "<h2>Title</h2><p>Ordinary prose.</p>";
  assertEquals(upgradeLegacyMath(html), html);
});

Deno.test("legacy maths: running it twice changes nothing the second time", () => {
  const once = upgradeLegacyMath(
    "<p>$$E = mc^2$$</p><p>and $x_{i}$ too, for $9.</p>",
  );
  assertEquals(upgradeLegacyMath(once), once);
});

Deno.test("legacy maths: the rendered formula is sanitized like anything stored", () => {
  const out = upgradeLegacyMath("<p>$\\text{a}$<script>alert(1)</script></p>");
  assertStringIncludes(out, "<math");
  assertEquals(/<script/i.test(out), false);
});

Deno.test("legacy maths: a lone symbol is a formula, a price is not", () => {
  const out = upgradeLegacyMath("<p>dimension $d$, and it costs $5 and $6.</p>");
  assertEquals(annotation(out), "d");
  assertStringIncludes(out, "costs $5 and $6.");
});

Deno.test("legacy maths: an escape Markdown ate is put back", () => {
  // `\left\{ … \right\}` reached storage as `\left{ … \right}`, which KaTeX
  // cannot parse at all — so restoring the backslash can only help.
  const out = upgradeLegacyMath("<p>$$\\left{ x \\right}$$</p>");
  assertEquals(annotation(out), "\\left\\{ x \\right\\}");
  assertEquals(out.includes("katex-error"), false);
});

Deno.test("legacy maths: an earlier run's failures are retried", () => {
  // The first pass stored what it could not parse as a katex-error span. There
  // is no `$` left to find those by, so they are reached for by name.
  const out = upgradeLegacyMath(
    '<p><span class="katex-error">\\left{ x \\right}</span></p>',
  );
  assertStringIncludes(out, '<p class="katex-block">');
  assertStringIncludes(out, "<math");
  assertEquals(out.includes("katex-error"), false);
});

Deno.test("legacy maths: a formula that still will not parse keeps its span", () => {
  const html = '<p><span class="katex-error">\\hopeless{</span></p>';
  assertEquals(upgradeLegacyMath(html), html);
});
