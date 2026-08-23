// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";
import { htmlToText } from "@/lib/html.ts";
import { badRequest } from "@/lib/http.ts";
import { slugify } from "@/lib/slug.ts";

// Pure rules for the content-ingestion webhook (POST /api/webhooks/content):
// how a caller's credentials are compared, what a valid payload looks like, and
// how the derived fields are computed. Deliberately free of config and database
// imports so all of it is unit-testable on its own — the orchestration that
// needs those lives in services/webhooks.ts.

// ── Credentials ─────────────────────────────────────────────────────────────

const encoder = new TextEncoder();

function sha256(s: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", encoder.encode(s));
}

/**
 * Constant-time comparison of a presented secret against the configured one.
 *
 * Comparing fixed-width digests rather than the strings themselves keeps the
 * work independent of both the content *and* the length of what the caller
 * sent, so a `===`-style early exit can't be timed to recover the secret byte
 * by byte.
 */
export async function secretMatches(presented: string | null, expected: string): Promise<boolean> {
  if (!presented) return false;
  const [a, b] = await Promise.all([sha256(presented), sha256(expected)]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

// ── Per-user tokens ─────────────────────────────────────────────────────────

// Marks a credential as an Omicron webhook token. The prefix is not a security
// measure — it lets a person (and a secret scanner) recognise a leaked string
// on sight, and lets us tell a user token apart from the instance-wide
// WEBHOOK_SECRET without a database round-trip.
export const TOKEN_PREFIX = "omi_wh_";

/** True if a presented credential is shaped like a per-user token. */
export function looksLikeToken(presented: string): boolean {
  return presented.startsWith(TOKEN_PREFIX);
}

/**
 * Mint a new token: the prefix plus 32 bytes of CSPRNG entropy in hex. Returned
 * in plaintext exactly once — only `hashToken` of it is ever stored.
 */
export function generateToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return TOKEN_PREFIX + Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * SHA-256 of a token, hex-encoded — the only form that reaches the database.
 *
 * A plain hash rather than a password KDF is right here: unlike a password,
 * this is 256 bits of uniform randomness we generated, so there is no dictionary
 * to attack and nothing for a slow KDF to buy. It also keeps the lookup a
 * single indexed probe instead of a scan over every row.
 */
export async function hashToken(token: string): Promise<string> {
  const digest = await sha256(token);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Pulls the caller's secret out of either accepted header —
 * `X-Webhook-Secret: <token>` or `Authorization: Bearer <token>` — returning
 * null when neither carries one.
 */
export function presentedSecret(headers: Headers): string | null {
  const direct = headers.get("x-webhook-secret")?.trim();
  if (direct) return direct;
  const auth = headers.get("authorization")?.trim();
  const bearer = auth?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || null;
}

// ── Payload ─────────────────────────────────────────────────────────────────

/** Longest auto-derived summary, in characters, before the ellipsis. */
export const SUMMARY_LENGTH = 150;

const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((u) => /^https?:\/\/\S+$/i.test(u), "must be an absolute http(s) URL");

// Every field is optional at the schema level, because a delivery addressing a
// post that already exists is a partial update: send `status` alone to unpublish
// it, `title` alone after a retitle, and everything left out keeps the value it
// has. Only a *first* delivery — one that creates the post — needs a title and a
// body, which `requireCreateFields` enforces once the service knows which it is.
//
// A field sent as `null` is an explicit clear, distinct from leaving it out:
// `banner: null` drops the cover, `description: null` returns the summary to the
// one derived from the body.
export const contentSchema = z.object({
  title: z.string().trim().min(1, "must not be empty").max(300).optional(),
  body: z.string().min(1, "must not be empty").optional(),
  description: z.string().trim().max(500).nullish(),
  banner: httpUrl.nullish(),
  // The external system's stable key for this document. Optional: without it we
  // fall back to the title's slug, which means a retitle publishes a new post.
  // Senders that have a document id should send it — it is the only way an
  // edited title updates the existing post in place, and the only way to address
  // a post at all without resending its title.
  slug: z.string().trim().min(1).max(200).optional(),
  // Passthroughs onto the ordinary post fields, so an ingested post is a
  // first-class one rather than a stripped-down import.
  tags: z.array(z.string()).max(50).optional(),
  language: z.string().trim().max(20).nullish(),
  // Deliberately without `scheduled`: an ingesting CMS sends no publish time,
  // and the state is meaningless (and rejected by the database) without one. A
  // CMS that wants to schedule should hold the post itself and deliver it when
  // it is due. Scheduling through the webhook would need a `publishAt` field
  // here and is a separate feature.
  status: z.enum(["draft", "published"]).optional(),
});

export type ContentPayload = z.infer<typeof contentSchema>;

/**
 * Validate an untrusted request body against `contentSchema`, raising a 400
 * that names the offending field. Never echoes the value back — only which
 * field failed and why.
 */
export function parseContent(body: unknown): ContentPayload {
  const parsed = contentSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".");
    const detail = issue?.message ?? "is invalid";
    throw badRequest(path ? `\`${path}\` ${detail}.` : "Invalid payload.");
  }
  return parsed.data;
}

/**
 * The fields a payload must carry when there is no post behind its key yet.
 *
 * A partial update borrows the absent fields from the row it is updating; a
 * create has nothing to borrow from, so `title` and `body` become required at
 * exactly that moment. Raised as the same 400 the schema would have, naming the
 * field, so a sender that has simply forgotten one reads the same error whether
 * it sent a bad value or none at all.
 */
export function requireCreateFields(payload: ContentPayload): void {
  for (const field of ["title", "body"] as const) {
    if (!payload[field]) {
      throw badRequest(
        `\`${field}\` is required: no post exists under this key yet, so this ` +
          `request creates one rather than updating one.`,
      );
    }
  }
}

/**
 * Derive a short preview from a rendered post body — used when the sender
 * supplies no `description`. Flattening the *rendered* HTML rather than
 * stripping Markdown by hand means every syntax markdown-it understands is
 * handled, including what a regex would miss (reference links, HTML blocks,
 * tables). Truncation lands on a word boundary when one is close enough.
 *
 * The frontend's `excerpt` (lib/format.ts) is the same rule, for posts written
 * in the editor rather than ingested. The two appear side by side in one feed,
 * so change them together.
 */
export function summarize(contentHtml: string, limit = SUMMARY_LENGTH): string {
  const text = htmlToText(stripHeadingMarkers(contentHtml)).replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit);
  const lastSpace = clipped.lastIndexOf(" ");
  // Only honour the word boundary when it isn't throwing most of the text away.
  const head = lastSpace > limit * 0.6 ? clipped.slice(0, lastSpace) : clipped;
  return `${head.replace(/[\s.,;:!?-]+$/, "")}…`;
}

// A heading written `#UserID` — no space after the marker — is not an ATX
// heading as far as markdown-it is concerned, so it renders as a literal `#` at
// the start of a paragraph rather than an `<h1>`. That hash is Markdown syntax,
// not prose: it heads every section of an ingested man page, and it showed up
// in the summary as "#UserID The user ID …". Drop the marker so the summary
// reads "UserID The user ID …". Anchoring the strip to a block-level opening
// tag — never `<pre>`/`<code>` — leaves a genuine `#` untouched, whether that
// is `#include` inside a code fence or a hashtag mid-prose.
function stripHeadingMarkers(html: string): string {
  return html.replace(/(<(?:p|li|blockquote|td|th)(?:\s[^>]*)?>)\s*#{1,6}(?=\S)/g, "$1");
}

/**
 * The key a document is stored under: its explicit `slug`, else one derived
 * from the title. Slugs are ASCII-only, so a title written entirely in a
 * non-Latin script derives to nothing — that has to be an error rather than an
 * empty key, which the unique index would let exactly one post hold.
 *
 * A partial update may carry no title at all, in which case `slug` is the only
 * thing naming the post and is therefore required.
 */
export function externalKey(payload: Pick<ContentPayload, "slug" | "title">): string {
  const key = payload.slug?.trim() || (payload.title ? slugify(payload.title) : "");
  if (!key) {
    throw badRequest("`slug` is required: no key could be derived from this payload.");
  }
  return key;
}
