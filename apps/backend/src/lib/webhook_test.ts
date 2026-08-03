// SPDX-License-Identifier: AGPL-3.0-or-later
import { assert, assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import {
  externalKey,
  generateToken,
  hashToken,
  looksLikeToken,
  parseContent,
  presentedSecret,
  requireCreateFields,
  secretMatches,
  summarize,
  SUMMARY_LENGTH,
  TOKEN_PREFIX,
} from "@/lib/webhook.ts";
import { renderMarkdown } from "@/lib/markdown.ts";
import { HttpError } from "@/lib/http.ts";

// The ingestion webhook is the one write path with no human and no session
// behind it: whatever a CMS sends lands in a published, federating post. These
// tests pin the three things that decide whether that is safe — who is let in,
// what shape of payload is accepted, and what the derived fields contain.

const SECRET = "s3cret-token-long-enough-to-pass";

// ── Credentials ─────────────────────────────────────────────────────────────

Deno.test("secretMatches: accepts the exact secret", async () => {
  assertEquals(await secretMatches(SECRET, SECRET), true);
});

Deno.test("secretMatches: rejects a wrong, truncated, or extended token", async () => {
  assertEquals(await secretMatches("wrong", SECRET), false);
  assertEquals(await secretMatches(SECRET.slice(0, -1), SECRET), false);
  assertEquals(await secretMatches(SECRET + "x", SECRET), false);
  // A near-miss in the last byte must fail as surely as a wholly different one.
  assertEquals(await secretMatches(SECRET.slice(0, -1) + "T", SECRET), false);
});

Deno.test("secretMatches: rejects a missing or empty token", async () => {
  assertEquals(await secretMatches(null, SECRET), false);
  assertEquals(await secretMatches("", SECRET), false);
});

Deno.test("presentedSecret: reads both accepted headers", () => {
  assertEquals(
    presentedSecret(new Headers({ "x-webhook-secret": SECRET })),
    SECRET,
  );
  assertEquals(
    presentedSecret(new Headers({ authorization: `Bearer ${SECRET}` })),
    SECRET,
  );
  // Case-insensitive scheme, surrounding whitespace trimmed.
  assertEquals(
    presentedSecret(new Headers({ authorization: `bearer   ${SECRET}  ` })),
    SECRET,
  );
});

Deno.test("presentedSecret: null when no credential is offered", () => {
  assertEquals(presentedSecret(new Headers()), null);
  assertEquals(presentedSecret(new Headers({ authorization: "Basic abc" })), null);
  assertEquals(presentedSecret(new Headers({ "x-webhook-secret": "   " })), null);
});

// ── Per-user tokens ─────────────────────────────────────────────────────────

Deno.test("generateToken: prefixed, and unique across mints", () => {
  const a = generateToken();
  const b = generateToken();
  assert(a.startsWith(TOKEN_PREFIX), `missing prefix: ${a}`);
  assertEquals(a === b, false);
  // 32 random bytes as hex, after the prefix.
  assertEquals(a.length, TOKEN_PREFIX.length + 64);
  assert(/^[0-9a-f]{64}$/.test(a.slice(TOKEN_PREFIX.length)), "body is not 64 hex chars");
});

Deno.test("looksLikeToken: separates user tokens from the instance secret", () => {
  assertEquals(looksLikeToken(generateToken()), true);
  // A WEBHOOK_SECRET is an operator-chosen string with no prefix; it must not be
  // mistaken for a token, or it would be looked up in the tokens table and fail.
  assertEquals(looksLikeToken("a-long-instance-wide-secret-value"), false);
  assertEquals(looksLikeToken(""), false);
});

Deno.test("hashToken: stable, and never returns the token itself", async () => {
  const token = generateToken();
  const hash = await hashToken(token);
  assertEquals(await hashToken(token), hash); // deterministic — the lookup key
  assertEquals(hash.includes(token), false);
  assertEquals(hash, hash.toLowerCase());
  assertEquals(hash.length, 64); // SHA-256, hex
  // A different token must not collide.
  assertEquals(await hashToken(generateToken()) === hash, false);
});

Deno.test("hashToken: a one-character difference changes the whole hash", async () => {
  const token = generateToken();
  const a = await hashToken(token);
  const b = await hashToken(token.slice(0, -1) + (token.endsWith("a") ? "b" : "a"));
  assertEquals(a === b, false);
});

// ── Payload validation ──────────────────────────────────────────────────────

const valid = { title: "Hello world", body: "# Hello\n\nSome **words**." };

Deno.test("parseContent: accepts the minimal payload", () => {
  const out = parseContent(valid);
  assertEquals(out.title, "Hello world");
  assertEquals(out.description, undefined);
  assertEquals(out.banner, undefined);
});

Deno.test("parseContent: rejects a present-but-empty field", () => {
  // Absent is legal — that is a partial update. Present and empty is a mistake.
  for (const body of [{ title: "  ", body: "x" }, { ...valid, body: "" }, null, 7]) {
    assertThrows(() => parseContent(body), HttpError);
  }
  // The error names the offending field so the sender can fix it.
  const err = assertThrows(() => parseContent({ title: "   " }), HttpError);
  assertStringIncludes(err.message, "title");
  assertEquals(err.status, 400);
});

Deno.test("parseContent: accepts a partial update carrying one field", () => {
  // The shape a CMS sends when only the status moved: no title, no body.
  assertEquals(parseContent({ slug: "doc-42", status: "draft" }).status, "draft");
  assertEquals(parseContent({ slug: "doc-42", title: "Renamed" }).title, "Renamed");
  // …and the empty payload, which addresses nothing and is caught by
  // `externalKey` rather than the schema.
  assertEquals(parseContent({}).title, undefined);
});

Deno.test("parseContent: keeps an explicit null distinct from an absent field", () => {
  // `null` clears the stored value; leaving the key out preserves it. The two
  // must survive parsing as different things or the service cannot tell them
  // apart.
  const cleared = parseContent({ slug: "doc-42", banner: null, description: null });
  assertEquals(cleared.banner, null);
  assertEquals(cleared.description, null);

  const absent = parseContent({ slug: "doc-42" });
  assertEquals(absent.banner, undefined);
  assertEquals(absent.description, undefined);
});

Deno.test("requireCreateFields: demanded on a create, waived on an update", () => {
  // A first delivery has no row to merge into, so it must carry both.
  for (const payload of [{ body: "x" }, { title: "x" }, {}]) {
    const err = assertThrows(() => requireCreateFields(parseContent(payload)), HttpError);
    assertEquals(err.status, 400);
  }
  assertStringIncludes(
    assertThrows(() => requireCreateFields(parseContent({ body: "x" })), HttpError).message,
    "title",
  );
  // A full payload passes; an update never reaches this check at all.
  requireCreateFields(parseContent(valid));
});

Deno.test("parseContent: rejects a banner that is not an absolute http(s) URL", () => {
  for (const banner of ["/local/cover.png", "javascript:alert(1)", "data:image/png;base64,AA"]) {
    const err = assertThrows(() => parseContent({ ...valid, banner }), HttpError);
    assertStringIncludes(err.message, "banner");
  }
  assertEquals(
    parseContent({ ...valid, banner: "https://cdn.example.com/a.png" }).banner,
    "https://cdn.example.com/a.png",
  );
});

Deno.test("parseContent: rejects an unknown status", () => {
  assertThrows(() => parseContent({ ...valid, status: "archived" }), HttpError);
  assertEquals(parseContent({ ...valid, status: "draft" }).status, "draft");
});

// ── Derived fields ──────────────────────────────────────────────────────────

Deno.test("summarize: returns short text whole, without an ellipsis", () => {
  const out = summarize(renderMarkdown("Just a line."));
  assertEquals(out, "Just a line.");
});

Deno.test("summarize: strips markup and truncates on a word boundary", () => {
  const html = renderMarkdown(
    "## A heading\n\nThe **quick** brown [fox](https://example.com) jumps over the lazy dog, " +
      "and then keeps right on running well past any reasonable preview length so that we " +
      "are certain the clip happens.",
  );
  const out = summarize(html);

  assert(out.length <= SUMMARY_LENGTH + 1, `too long: ${out.length}`);
  assert(out.endsWith("…"), `expected an ellipsis, got: ${out}`);
  // No markup, no Markdown syntax, and no mid-word cut.
  assertEquals(out.includes("<"), false);
  assertEquals(out.includes("**"), false);
  assertEquals(out.includes("]("), false);
  assertStringIncludes(out, "A heading The quick brown fox");
});

Deno.test("summarize: clips a single unbroken run rather than emptying it", () => {
  const out = summarize(renderMarkdown("x".repeat(400)), 20);
  assertEquals(out, "x".repeat(20) + "…");
});

Deno.test("externalKey: prefers the sender's slug over the title", () => {
  assertEquals(externalKey({ title: "Hello world", slug: "cms-doc-42" }), "cms-doc-42");
});

Deno.test("externalKey: falls back to the title's slug, matching the reader's URL", () => {
  assertEquals(
    externalKey({ title: "It's a Big Step — Really!", slug: undefined }),
    "its-a-big-step-really",
  );
});

Deno.test("externalKey: demands an explicit slug when the title derives to nothing", () => {
  const err = assertThrows(() => externalKey({ title: "日本語", slug: undefined }), HttpError);
  assertEquals(err.status, 400);
  assertStringIncludes(err.message, "slug");
  // …and is satisfied once the sender supplies one.
  assertEquals(externalKey({ title: "日本語", slug: "doc-7" }), "doc-7");
});

Deno.test("externalKey: a titleless partial update is addressed by its slug alone", () => {
  assertEquals(externalKey({ title: undefined, slug: "doc-42" }), "doc-42");
  // With neither, nothing names the post — that has to be a 400, not a write
  // against an empty key.
  const err = assertThrows(() => externalKey({ title: undefined, slug: undefined }), HttpError);
  assertEquals(err.status, 400);
  assertStringIncludes(err.message, "slug");
});

// ── Storage safety ──────────────────────────────────────────────────────────

Deno.test("ingested Markdown is sanitized before it can reach a row", () => {
  // The service stores `renderMarkdown(body)`, so the sanitizer is what stands
  // between an untrusted webhook and every reader's browser. Mirror of the
  // guarantees in sanitize_test.ts, asserted at this entry point.
  const html = renderMarkdown(
    "Hi\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n" +
      "[click](javascript:alert(1))",
  );
  assertEquals(html.includes("<script"), false);
  assertEquals(html.includes("onerror"), false);
  // A `javascript:` target never becomes a link. markdown-it declines to build
  // the anchor at all and leaves the source as inert text, so assert on the
  // attribute rather than the substring.
  assertEquals(/href\s*=\s*["']?\s*javascript:/i.test(html), false);
  assertEquals(html.includes("<a "), false);
  assertStringIncludes(html, "Hi");
});
