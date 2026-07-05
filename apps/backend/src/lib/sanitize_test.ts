// SPDX-License-Identifier: AGPL-3.0-or-later
import { assertEquals, assertStringIncludes } from "@std/assert";
import { sanitizePostHtml } from "@/lib/sanitize.ts";

// This is the ONLY trusted gateway for rich-text content (local + remote), and
// its output is rendered with {@html}. These tests pin the stored-XSS defenses:
// any regression here is a live vulnerability, so they guard the highest-risk
// surface in the app.

Deno.test("sanitize: strips <script> and its text content entirely", () => {
  const out = sanitizePostHtml(`<p>ok</p><script>alert('xss')</script>`);
  assertStringIncludes(out, "<p>ok</p>");
  assertEquals(out.includes("alert"), false);
  assertEquals(out.includes("<script"), false);
});

Deno.test("sanitize: drops inline event handlers", () => {
  const out = sanitizePostHtml(`<img src="https://x/y.png" onerror="alert(1)">`);
  assertEquals(out.includes("onerror"), false);
  assertEquals(out.includes("alert"), false);
});

Deno.test("sanitize: drops javascript: URLs on links", () => {
  const out = sanitizePostHtml(`<a href="javascript:alert(1)">click</a>`);
  assertEquals(out.toLowerCase().includes("javascript"), false);
  // The text survives; only the dangerous href is removed.
  assertStringIncludes(out, "click");
});

Deno.test("sanitize: rejects data: URIs (SVG script payloads)", () => {
  const out = sanitizePostHtml(
    `<img src="data:image/svg+xml,<svg onload=alert(1)>">`,
  );
  assertEquals(out.includes("data:"), false);
  assertEquals(out.includes("onload"), false);
});

Deno.test("sanitize: rejects protocol-relative URLs", () => {
  const out = sanitizePostHtml(`<a href="//evil.example/phish">x</a>`);
  assertEquals(out.includes("evil.example"), false);
});

Deno.test("sanitize: drops disallowed elements (iframe/style/form)", () => {
  const out = sanitizePostHtml(
    `<iframe src="https://evil"></iframe><style>*{}</style><form></form><p>keep</p>`,
  );
  assertStringIncludes(out, "<p>keep</p>");
  for (const tag of ["<iframe", "<style", "<form"]) {
    assertEquals(out.includes(tag), false, `${tag} should be dropped`);
  }
});

Deno.test("sanitize: keeps allowed rich-text markup", () => {
  const input = `<p>Hi <strong>bold</strong> <em>italic</em></p>` +
    `<ul><li>one</li></ul><blockquote>q</blockquote><pre><code>x</code></pre>`;
  const out = sanitizePostHtml(input);
  for (const frag of ["<strong>bold</strong>", "<em>italic</em>", "<li>one</li>", "<blockquote>"]) {
    assertStringIncludes(out, frag);
  }
});

Deno.test("sanitize: hardens surviving links (nofollow, noopener, _blank)", () => {
  const out = sanitizePostHtml(`<a href="https://ok.example">x</a>`);
  assertStringIncludes(out, `href="https://ok.example"`);
  assertStringIncludes(out, "nofollow");
  assertStringIncludes(out, "noopener");
  assertStringIncludes(out, `target="_blank"`);
});

Deno.test("sanitize: is idempotent on already-clean output", () => {
  const once = sanitizePostHtml(`<p>Hi <a href="https://ok.example">link</a></p>`);
  const twice = sanitizePostHtml(once);
  assertEquals(twice, once);
});

Deno.test("sanitize: null/undefined/empty become empty string", () => {
  assertEquals(sanitizePostHtml(null), "");
  assertEquals(sanitizePostHtml(undefined), "");
  assertEquals(sanitizePostHtml(""), "");
});
