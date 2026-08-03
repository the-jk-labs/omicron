// SPDX-License-Identifier: AGPL-3.0-or-later
import * as postsRepo from "@/db/repositories/posts.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import * as tokensRepo from "@/db/repositories/webhookTokens.ts";
import { resolveTags } from "@/services/posts.ts";
import { badRequest, conflict, forbidden, HttpError, unauthorized } from "@/lib/http.ts";
import { renderMarkdown } from "@/lib/markdown.ts";
import { normalizeLanguage } from "@/lib/languages.ts";
import {
  type ContentPayload,
  externalKey,
  hashToken,
  looksLikeToken,
  presentedSecret,
  secretMatches,
  summarize,
} from "@/lib/webhook.ts";
import { queue } from "@/queue/queue.ts";
import { config } from "@/config.ts";
import type { User } from "@/db/schema.ts";

// Content ingestion from an external system (Sanity, Contentful, a static-site
// build hook, …). One endpoint — POST /api/webhooks/content — takes a document
// and publishes it as a post by a local author, which then federates through
// the ordinary `federate_post` job like anything written in the editor.
//
// Two properties matter more than anything else here:
//
//   * **Idempotent.** The caller's `slug` is stored on the post as
//     `external_id`. Re-delivering the same document — a CMS republish, a retry
//     after a timeout, an at-least-once webhook — updates that post rather than
//     publishing a second copy.
//
//   * **Never trusted.** The body is Markdown from a machine we do not control,
//     so it goes through `renderMarkdown` — the same sanitizing gateway the
//     profile custom section uses — before it reaches a row. See the note on
//     storage on `ingestContent`.
//
// The payload rules and credential comparison live in lib/webhook.ts, free of
// config and DB imports so they can be unit-tested without either.

/**
 * Authenticates an ingestion request and resolves who the post will be by.
 *
 * Two kinds of credential are accepted, in this order:
 *
 *   1. A **per-user token** (`omi_wh_…`), minted by a writer in Settings. The
 *      post is published as that writer — the path an ordinary user has.
 *   2. The instance-wide **`WEBHOOK_SECRET`**, an operator-level fallback that
 *      publishes as `WEBHOOK_AUTHOR` (or the oldest account).
 *
 * With neither minted nor configured, every credential fails the same way: a
 * flat 401. There is no state in which an absent or empty secret is accepted.
 *
 * Nothing sensitive reaches a thrown message, so neither the error response nor
 * `handleError`'s log can leak a credential.
 */
export async function authenticate(headers: Headers): Promise<User> {
  const presented = presentedSecret(headers);
  if (!presented) throw unauthorized("Invalid webhook credentials.");

  // The prefix tells the two kinds apart without a database round-trip, so an
  // instance-secret request never costs a token lookup, or the other way about.
  if (looksLikeToken(presented)) return await authorForToken(presented);

  const expected = config.WEBHOOK_SECRET;
  if (!expected || !await secretMatches(presented, expected)) {
    throw unauthorized("Invalid webhook credentials.");
  }
  return await configuredAuthor();
}

// Resolves a per-user token to its owner. The lookup is by hash, so the
// plaintext is never compared and a revoked token simply fails to match.
async function authorForToken(presented: string): Promise<User> {
  const row = await tokensRepo.findLive(await hashToken(presented));
  if (!row) throw unauthorized("Invalid webhook credentials.");

  const user = await usersRepo.findById(row.userId);
  // Deleting an account cascades its tokens away, so a missing user is only
  // reachable in a race. Treat it as a bad credential, not a server error.
  if (!user) throw unauthorized("Invalid webhook credentials.");
  if (user.suspendedAt) throw forbidden("This account is suspended.");

  // Best-effort: the owner reads this to spot a token they forgot about, so it
  // must never delay or fail a publish.
  tokensRepo.touchLastUsed(row.id).catch(() => {});
  return user;
}

// The account the instance-wide secret publishes as. `WEBHOOK_AUTHOR` pins it
// by username; otherwise the oldest account (the admin the setup wizard
// creates) owns them, so a single-author instance configures nothing but the
// secret.
async function configuredAuthor(): Promise<User> {
  const username = config.WEBHOOK_AUTHOR;
  const user = username ? await usersRepo.findByUsername(username) : await usersRepo.firstUser();
  if (!user) {
    throw new HttpError(
      503,
      username
        ? `Content ingestion is misconfigured: no local account named "${username}".`
        : "Content ingestion is unavailable until this instance has an account.",
    );
  }
  if (user.suspendedAt) {
    throw new HttpError(503, "The ingestion author account is suspended.");
  }
  return user;
}

export type IngestResult = {
  id: string;
  slug: string;
  status: string;
  created: boolean;
};

/**
 * Create — or update, when the external key is already known — a post from an
 * ingested document, and hand it to the federation queue exactly the way the
 * editor's own create/update path does.
 *
 * On storage: the body is rendered to sanitized HTML on the way in rather than
 * kept as raw Markdown. `contentHtml` is what the reader renders with `{@html}`
 * and what `buildArticle` federates, and `sanitizePostHtml` is the single
 * trusted gateway into it (see lib/sanitize.ts) — so ingested content has to
 * come through the same door as everything else. Rendering once on write also
 * leaves ingested posts indistinguishable from editor-written ones downstream:
 * search, RSS, federation and the reader need no second code path.
 */
export async function ingestContent(
  payload: ContentPayload,
  author: User,
): Promise<IngestResult> {
  const externalId = externalKey(payload);

  const contentHtml = renderMarkdown(payload.body).trim();
  if (!contentHtml) throw badRequest("`body` contains no renderable content.");

  const status = payload.status ?? "published";
  const fields = {
    title: payload.title,
    contentHtml,
    // Ingested posts carry no Tiptap document; opening one in the editor
    // rehydrates from `contentHtml`, the same as a post imported over
    // federation.
    contentJson: null,
    summary: payload.description || summarize(contentHtml),
    coverUrl: payload.banner ?? null,
    status,
    language: normalizeLanguage(payload.language ?? null),
  };

  // Read the current row first: the write itself is an upsert (delivery is
  // at-least-once, so a duplicate must not race into a unique violation), but
  // the ownership check and the create-vs-update answer both need to know what
  // was there before it.
  // The lookup is already scoped to this author, so another writer's identical
  // slug is invisible here and cannot be addressed, let alone overwritten.
  const existing = await postsRepo.findByExternalId(author.id, externalId);

  // A remote post could never carry an external key, but guard the invariant
  // rather than trust it.
  if (existing?.remote) {
    throw conflict("That slug belongs to a post this webhook does not own.");
  }

  const post = await postsRepo.upsertByExternalId({
    ...fields,
    authorId: author.id,
    externalId,
  });

  // Tags are replaced wholesale when the payload carries the field; omitting it
  // leaves whatever the post already has, and `[]` clears them.
  if (payload.tags !== undefined) {
    await tagsRepo.setPostTags(post.id, resolveTags(payload.tags));
  }

  // Federation, mirroring services/posts.ts: a published post fans out — as an
  // Update when remote instances already hold a copy, otherwise a Create — and
  // unpublishing one tombstones the copies already delivered.
  const wasPublished = existing?.status === "published";
  if (status === "published") {
    queue.add("federate_post", { postId: post.id, action: wasPublished ? "update" : "create" });
  } else if (wasPublished) {
    queue.add("federate_post_delete", { postId: post.id, authorId: author.id });
  }

  return { id: post.id, slug: externalId, status: post.status, created: !existing };
}
