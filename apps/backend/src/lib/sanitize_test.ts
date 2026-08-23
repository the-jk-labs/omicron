// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { sanitizePostHtml } from "@/lib/sanitize.ts";

// This is the ONLY trusted gateway for rich-text content (local + remote), and
// its output is rendered with {@html}. These tests pin the stored-XSS defenses:
// any regression here is a live vulnerability, so they guard the highest-risk
// surface in the app.

test("sanitize: strips <script> and its text content entirely", () => {
  const out = sanitizePostHtml(`<p>ok</p><script>alert('xss')</script>`);
  expect(out).toContain("<p>ok</p>");
  expect(out.includes("alert")).toBe(false);
  expect(out.includes("<script")).toBe(false);
});

test("sanitize: drops inline event handlers", () => {
  const out = sanitizePostHtml(`<img src="https://x/y.png" onerror="alert(1)">`);
  expect(out.includes("onerror")).toBe(false);
  expect(out.includes("alert")).toBe(false);
});

test("sanitize: drops javascript: URLs on links", () => {
  const out = sanitizePostHtml(`<a href="javascript:alert(1)">click</a>`);
  expect(out.toLowerCase().includes("javascript")).toBe(false);
  // The text survives; only the dangerous href is removed.
  expect(out).toContain("click");
});

test("sanitize: rejects data: URIs (SVG script payloads)", () => {
  const out = sanitizePostHtml(`<img src="data:image/svg+xml,<svg onload=alert(1)>">`);
  expect(out.includes("data:")).toBe(false);
  expect(out.includes("onload")).toBe(false);
});

test("sanitize: rejects protocol-relative URLs", () => {
  const out = sanitizePostHtml(`<a href="//evil.example/phish">x</a>`);
  expect(out.includes("evil.example")).toBe(false);
});

test("sanitize: drops disallowed elements (iframe/style/form)", () => {
  const out = sanitizePostHtml(`<iframe src="https://evil"></iframe><style>*{}</style><form></form><p>keep</p>`);
  expect(out).toContain("<p>keep</p>");
  for (const tag of ["<iframe", "<style", "<form"]) {
    expect(out.includes(tag), `${tag} should be dropped`).toBe(false);
  }
});

test("sanitize: keeps allowed rich-text markup", () => {
  const input =
    `<p>Hi <strong>bold</strong> <em>italic</em></p>` +
    `<ul><li>one</li></ul><blockquote>q</blockquote><pre><code>x</code></pre>`;
  const out = sanitizePostHtml(input);
  for (const frag of ["<strong>bold</strong>", "<em>italic</em>", "<li>one</li>", "<blockquote>"]) {
    expect(out).toContain(frag);
  }
});

test("sanitize: hardens surviving links (nofollow, noopener, _blank)", () => {
  const out = sanitizePostHtml(`<a href="https://ok.example">x</a>`);
  expect(out).toContain(`href="https://ok.example"`);
  expect(out).toContain("nofollow");
  expect(out).toContain("noopener");
  expect(out).toContain(`target="_blank"`);
});

test("sanitize: is idempotent on already-clean output", () => {
  const once = sanitizePostHtml(`<p>Hi <a href="https://ok.example">link</a></p>`);
  const twice = sanitizePostHtml(once);
  expect(twice).toBe(once);
});

test("sanitize: null/undefined/empty become empty string", () => {
  expect(sanitizePostHtml(null)).toBe("");
  expect(sanitizePostHtml(undefined)).toBe("");
  expect(sanitizePostHtml("")).toBe("");
});

test("sanitize: keeps a MathML formula whole", () => {
  // A remote Article's maths arrives as MathML, same as ours (lib/markdown.ts).
  // Structure and layout attributes both have to survive — a dropped <mfrac> is
  // a formula that reads as its own numerator.
  const math =
    '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">' +
    "<mfrac><mi>a</mi><msub><mi>b</mi><mn>2</mn></msub></mfrac>" +
    '<mo stretchy="false">)</mo></math>';
  expect(sanitizePostHtml(math)).toBe(math);
});

test("sanitize: MathML is not a way in for script", () => {
  const out = sanitizePostHtml(
    '<math><mtext onmouseover="alert(1)" href="javascript:alert(1)">x</mtext>' +
      '<maction actiontype="statusline">y</maction>' +
      "<mi><script>alert(1)</script></mi></math>",
  );
  expect(/onmouseover|javascript:|maction|<script/i.test(out)).toBe(false);
  expect(out).toContain("<mtext>x</mtext>");
});
