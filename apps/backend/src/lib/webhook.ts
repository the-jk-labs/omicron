// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";
import { badRequest } from "@/lib/http.ts";
import { htmlToText } from "@/lib/html.ts";
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
export async function secretMatches(
  presented: string | null,
  expected: string,
): Promise<boolean> {
  if (!presented) return false;
  const [a, b] = await Promise.all([sha256(presented), sha256(expected)]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
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

export const contentSchema = z.object({
  title: z.string().trim().min(1, "is required").max(300),
  body: z.string().min(1, "is required"),
  description: z.string().trim().max(500).optional(),
  banner: httpUrl.optional(),
  // The external system's stable key for this document. Optional: without it we
  // fall back to the title's slug, which means a retitle publishes a new post.
  // Senders that have a document id should send it — it is the only way an
  // edited title updates the existing post in place.
  slug: z.string().trim().min(1).max(200).optional(),
  // Passthroughs onto the ordinary post fields, so an ingested post is a
  // first-class one rather than a stripped-down import.
  tags: z.array(z.string()).max(50).optional(),
  language: z.string().trim().max(20).nullish(),
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
 * Derive a short preview from a rendered post body — used when the sender
 * supplies no `description`. Flattening the *rendered* HTML rather than
 * stripping Markdown by hand means every syntax markdown-it understands is
 * handled, including what a regex would miss (reference links, HTML blocks,
 * tables). Truncation lands on a word boundary when one is close enough.
 */
export function summarize(contentHtml: string, limit = SUMMARY_LENGTH): string {
  const text = htmlToText(contentHtml).replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit);
  const lastSpace = clipped.lastIndexOf(" ");
  // Only honour the word boundary when it isn't throwing most of the text away.
  const head = lastSpace > limit * 0.6 ? clipped.slice(0, lastSpace) : clipped;
  return `${head.replace(/[\s.,;:!?-]+$/, "")}…`;
}

/**
 * The key a document is stored under: its explicit `slug`, else one derived
 * from the title. Slugs are ASCII-only, so a title written entirely in a
 * non-Latin script derives to nothing — that has to be an error rather than an
 * empty key, which the unique index would let exactly one post hold.
 */
export function externalKey(payload: Pick<ContentPayload, "slug" | "title">): string {
  const key = payload.slug?.trim() || slugify(payload.title);
  if (!key) {
    throw badRequest(
      "`slug` is required: no key could be derived from this title.",
    );
  }
  return key;
}
