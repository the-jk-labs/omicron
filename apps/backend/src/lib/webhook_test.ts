// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { HttpError } from "@/lib/http.ts";
import { renderMarkdown } from "@/lib/markdown.ts";
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

// The ingestion webhook is the one write path with no human and no session
// behind it: whatever a CMS sends lands in a published, federating post. These
// tests pin the three things that decide whether that is safe — who is let in,
// what shape of payload is accepted, and what the derived fields contain.

const SECRET = "s3cret-token-long-enough-to-pass";

// Runs `fn`, asserts it threw an HttpError, and hands the error back so the
// caller can pin its status and message.
function caught(fn: () => unknown): HttpError {
  let caughtErr: unknown;
  let threw = false;
  try {
    fn();
  } catch (err) {
    threw = true;
    caughtErr = err;
  }
  expect(threw, "expected the call to throw").toBe(true);
  expect(caughtErr).toBeInstanceOf(HttpError);
  return caughtErr as HttpError;
}

// ── Credentials ─────────────────────────────────────────────────────────────

test("secretMatches: accepts the exact secret", async () => {
  expect(await secretMatches(SECRET, SECRET)).toBe(true);
});

test("secretMatches: rejects a wrong, truncated, or extended token", async () => {
  expect(await secretMatches("wrong", SECRET)).toBe(false);
  expect(await secretMatches(SECRET.slice(0, -1), SECRET)).toBe(false);
  expect(await secretMatches(SECRET + "x", SECRET)).toBe(false);
  // A near-miss in the last byte must fail as surely as a wholly different one.
  expect(await secretMatches(SECRET.slice(0, -1) + "T", SECRET)).toBe(false);
});

test("secretMatches: rejects a missing or empty token", async () => {
  expect(await secretMatches(null, SECRET)).toBe(false);
  expect(await secretMatches("", SECRET)).toBe(false);
});

test("presentedSecret: reads both accepted headers", () => {
  expect(presentedSecret(new Headers({ "x-webhook-secret": SECRET }))).toBe(SECRET);
  expect(presentedSecret(new Headers({ authorization: `Bearer ${SECRET}` }))).toBe(SECRET);
  // Case-insensitive scheme, surrounding whitespace trimmed.
  expect(presentedSecret(new Headers({ authorization: `bearer   ${SECRET}  ` }))).toBe(SECRET);
});

test("presentedSecret: null when no credential is offered", () => {
  expect(presentedSecret(new Headers())).toBe(null);
  expect(presentedSecret(new Headers({ authorization: "Basic abc" }))).toBe(null);
  expect(presentedSecret(new Headers({ "x-webhook-secret": "   " }))).toBe(null);
});

// ── Per-user tokens ─────────────────────────────────────────────────────────

test("generateToken: prefixed, and unique across mints", () => {
  const a = generateToken();
  const b = generateToken();
  expect(a.startsWith(TOKEN_PREFIX), `missing prefix: ${a}`).toBe(true);
  expect(a).not.toBe(b);
  // 32 random bytes as hex, after the prefix.
  expect(a.length).toBe(TOKEN_PREFIX.length + 64);
  expect(/^[0-9a-f]{64}$/.test(a.slice(TOKEN_PREFIX.length)), "body is not 64 hex chars").toBe(true);
});

test("looksLikeToken: separates user tokens from the instance secret", () => {
  expect(looksLikeToken(generateToken())).toBe(true);
  // A WEBHOOK_SECRET is an operator-chosen string with no prefix; it must not be
  // mistaken for a token, or it would be looked up in the tokens table and fail.
  expect(looksLikeToken("a-long-instance-wide-secret-value")).toBe(false);
  expect(looksLikeToken("")).toBe(false);
});

test("hashToken: stable, and never returns the token itself", async () => {
  const token = generateToken();
  const hash = await hashToken(token);
  expect(await hashToken(token)).toBe(hash); // deterministic — the lookup key
  expect(hash.includes(token)).toBe(false);
  expect(hash).toBe(hash.toLowerCase());
  expect(hash.length).toBe(64); // SHA-256, hex
  // A different token must not collide.
  expect(await hashToken(generateToken())).not.toBe(hash);
});

test("hashToken: a one-character difference changes the whole hash", async () => {
  const token = generateToken();
  const a = await hashToken(token);
  const b = await hashToken(token.slice(0, -1) + (token.endsWith("a") ? "b" : "a"));
  expect(a).not.toBe(b);
});

// ── Payload validation ──────────────────────────────────────────────────────

const valid = { title: "Hello world", body: "# Hello\n\nSome **words**." };

test("parseContent: accepts the minimal payload", () => {
  const out = parseContent(valid);
  expect(out.title).toBe("Hello world");
  expect(out.description).toBe(undefined);
  expect(out.banner).toBe(undefined);
});

test("parseContent: rejects a present-but-empty field", () => {
  // Absent is legal — that is a partial update. Present and empty is a mistake.
  for (const body of [{ title: "  ", body: "x" }, { ...valid, body: "" }, null, 7]) {
    expect(() => parseContent(body)).toThrow(HttpError);
  }
  // The error names the offending field so the sender can fix it.
  const err = caught(() => parseContent({ title: "   " }));
  expect(err.message).toContain("title");
  expect(err.status).toBe(400);
});

test("parseContent: accepts a partial update carrying one field", () => {
  // The shape a CMS sends when only the status moved: no title, no body.
  expect(parseContent({ slug: "doc-42", status: "draft" }).status).toBe("draft");
  expect(parseContent({ slug: "doc-42", title: "Renamed" }).title).toBe("Renamed");
  // …and the empty payload, which addresses nothing and is caught by
  // `externalKey` rather than the schema.
  expect(parseContent({}).title).toBe(undefined);
});

test("parseContent: keeps an explicit null distinct from an absent field", () => {
  // `null` clears the stored value; leaving the key out preserves it. The two
  // must survive parsing as different things or the service cannot tell them
  // apart.
  const cleared = parseContent({ slug: "doc-42", banner: null, description: null });
  expect(cleared.banner).toBe(null);
  expect(cleared.description).toBe(null);

  const absent = parseContent({ slug: "doc-42" });
  expect(absent.banner).toBe(undefined);
  expect(absent.description).toBe(undefined);
});

test("requireCreateFields: demanded on a create, waived on an update", () => {
  // A first delivery has no row to merge into, so it must carry both.
  for (const payload of [{ body: "x" }, { title: "x" }, {}]) {
    const err = caught(() => requireCreateFields(parseContent(payload)));
    expect(err.status).toBe(400);
  }
  expect(caught(() => requireCreateFields(parseContent({ body: "x" }))).message).toContain("title");
  // A full payload passes; an update never reaches this check at all.
  requireCreateFields(parseContent(valid));
});

test("parseContent: rejects a banner that is not an absolute http(s) URL", () => {
  for (const banner of ["/local/cover.png", "javascript:alert(1)", "data:image/png;base64,AA"]) {
    const err = caught(() => parseContent({ ...valid, banner }));
    expect(err.message).toContain("banner");
  }
  expect(parseContent({ ...valid, banner: "https://cdn.example.com/a.png" }).banner).toBe(
    "https://cdn.example.com/a.png",
  );
});

test("parseContent: rejects an unknown status", () => {
  expect(() => parseContent({ ...valid, status: "archived" })).toThrow(HttpError);
  expect(parseContent({ ...valid, status: "draft" }).status).toBe("draft");
});

// ── Derived fields ──────────────────────────────────────────────────────────

test("summarize: returns short text whole, without an ellipsis", () => {
  const out = summarize(renderMarkdown("Just a line."));
  expect(out).toBe("Just a line.");
});

test("summarize: strips markup and truncates on a word boundary", () => {
  const html = renderMarkdown(
    "## A heading\n\nThe **quick** brown [fox](https://example.com) jumps over the lazy dog, " +
      "and then keeps right on running well past any reasonable preview length so that we " +
      "are certain the clip happens.",
  );
  const out = summarize(html);

  expect(out.length, `too long: ${out.length}`).toBeLessThanOrEqual(SUMMARY_LENGTH + 1);
  expect(out.endsWith("…"), `expected an ellipsis, got: ${out}`).toBe(true);
  // No markup, no Markdown syntax, and no mid-word cut.
  expect(out.includes("<")).toBe(false);
  expect(out.includes("**")).toBe(false);
  expect(out.includes("](")).toBe(false);
  expect(out).toContain("A heading The quick brown fox");
});

test("summarize: clips a single unbroken run rather than emptying it", () => {
  const out = summarize(renderMarkdown("x".repeat(400)), 20);
  expect(out).toBe("x".repeat(20) + "…");
});

test("summarize: drops a heading marker markdown leaves literal", () => {
  const out = summarize(renderMarkdown("#UserID The user ID from our entry in the password file"));
  expect(out).toBe("UserID The user ID from our entry in the password file");
});

test("summarize: drops the marker on every section, not just the first", () => {
  const out = summarize(renderMarkdown("#UserID The user id\n\n#ProcandprocID An executing instance\n\nBody text."));
  expect(out.includes("#"), `still has a hash: ${out}`).toBe(false);
  expect(out).toContain("UserID The user id");
  expect(out).toContain("ProcandprocID An executing instance");
});

test("summarize: leaves a hash inside a code fence alone", () => {
  const out = summarize(renderMarkdown("#NAME proc\n\n```c\n#include <sys/types.h>\n```\n"), 200);
  expect(out).toContain("#include <sys/types.h>");
});

test("externalKey: prefers the sender's slug over the title", () => {
  expect(externalKey({ title: "Hello world", slug: "cms-doc-42" })).toBe("cms-doc-42");
});

test("externalKey: falls back to the title's slug, matching the reader's URL", () => {
  expect(externalKey({ title: "It's a Big Step — Really!", slug: undefined })).toBe("its-a-big-step-really");
});

test("externalKey: demands an explicit slug when the title derives to nothing", () => {
  const err = caught(() => externalKey({ title: "日本語", slug: undefined }));
  expect(err.status).toBe(400);
  expect(err.message).toContain("slug");
  // …and is satisfied once the sender supplies one.
  expect(externalKey({ title: "日本語", slug: "doc-7" })).toBe("doc-7");
});

test("externalKey: a titleless partial update is addressed by its slug alone", () => {
  expect(externalKey({ title: undefined, slug: "doc-42" })).toBe("doc-42");
  // With neither, nothing names the post — that has to be a 400, not a write
  // against an empty key.
  const err = caught(() => externalKey({ title: undefined, slug: undefined }));
  expect(err.status).toBe(400);
  expect(err.message).toContain("slug");
});

// ── Storage safety ──────────────────────────────────────────────────────────

test("ingested Markdown is sanitized before it can reach a row", () => {
  // The service stores `renderMarkdown(body)`, so the sanitizer is what stands
  // between an untrusted webhook and every reader's browser. Mirror of the
  // guarantees in sanitize_test.ts, asserted at this entry point.
  const html = renderMarkdown(
    "Hi\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[click](javascript:alert(1))",
  );
  expect(html.includes("<script")).toBe(false);
  expect(html.includes("onerror")).toBe(false);
  // A `javascript:` target never becomes a link. markdown-it declines to build
  // the anchor at all and leaves the source as inert text, so assert on the
  // attribute rather than the substring.
  expect(/href\s*=\s*["']?\s*javascript:/i.test(html)).toBe(false);
  expect(html.includes("<a ")).toBe(false);
  expect(html).toContain("Hi");
});
