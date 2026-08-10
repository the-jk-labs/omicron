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
  requireCreateFields,
  secretMatches,
  summarize,
} from "@/lib/webhook.ts";
import { queue } from "@/queue/queue.ts";
import { syncSlug } from "@/services/postSlugs.ts";
import { config } from "@/config.ts";
import type { NewPost, User } from "@/db/schema.ts";

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
 * Updates are **partial**. A delivery addressing a post that already exists
 * changes only the fields it carries, so a CMS that knows a single field moved
 * sends that field: `{ "slug": "doc-42", "status": "draft" }` unpublishes,
 * `{ "slug": "doc-42", "title": "…" }` retitles, and neither has to resend a
 * body it did not touch. A field sent as `null` is an explicit clear
 * (`banner: null` drops the cover); a field left out is simply not written.
 *
 * A first delivery has nothing to merge into, so `title` and `body` are
 * required there and nowhere else.
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

  // Read the current row first. It answers create-vs-update, which in turn
  // decides both which fields this payload is required to carry and which are
  // left alone; the ownership check needs it too.
  // The lookup is already scoped to this author, so another writer's identical
  // slug is invisible here and cannot be addressed, let alone overwritten.
  const existing = await postsRepo.findByExternalId(author.id, externalId);

  // A remote post could never carry an external key, but guard the invariant
  // rather than trust it.
  if (existing?.remote) {
    throw conflict("That slug belongs to a post this webhook does not own.");
  }

  if (!existing) requireCreateFields(payload);

  // Only what the payload actually carries goes into the write; anything absent
  // keeps the value the row already holds.
  const fields: Partial<NewPost> = {};

  if (payload.body !== undefined) {
    const contentHtml = renderMarkdown(payload.body).trim();
    if (!contentHtml) throw badRequest("`body` contains no renderable content.");
    fields.contentHtml = contentHtml;
    // Ingested posts carry no Tiptap document; opening one in the editor
    // rehydrates from `contentHtml`, the same as a post imported over
    // federation. Re-cleared on every body change, so an edit made in the
    // editor and then overwritten from the CMS cannot leave a stale document
    // behind the fresh HTML.
    fields.contentJson = null;
  }
  if (payload.title !== undefined) fields.title = payload.title;
  if (payload.banner !== undefined) {
    fields.coverUrl = payload.banner;
    // The credit belongs to the image, so it goes when the image does. A CMS
    // never sends one, but a post whose banner was picked from a stock provider
    // in the editor and later replaced from the CMS would otherwise keep
    // crediting a photographer for a picture it no longer shows.
    fields.coverCredit = null;
  }
  if (payload.language !== undefined) fields.language = normalizeLanguage(payload.language);
  if (payload.status !== undefined) fields.status = payload.status;
  else if (!existing) fields.status = "published";

  // The summary follows the description when one is sent, and is re-derived
  // from the body whenever the body changes or the description is explicitly
  // cleared. A sender that curates its own description keeps it by sending it
  // alongside each body it changes.
  if (payload.description !== undefined) {
    fields.summary = payload.description || summarize(summarySource(fields, existing));
  } else if (fields.contentHtml !== undefined) {
    fields.summary = summarize(fields.contentHtml);
  }

  // Creating is an upsert rather than an insert because delivery is
  // at-least-once: two concurrent first deliveries of the same document would
  // otherwise both miss the lookup above and race into a unique violation.
  // Updating needs no such guard — concurrent partial updates of one row settle
  // as last-write-wins instead of colliding.
  //
  // A partial update that touches no post column at all is legitimate — `tags`
  // is the one field that lives elsewhere, so `{ slug, tags }` is a complete
  // request — and must not reach the writer, which rejects an empty SET.
  const post = existing
    ? Object.keys(fields).length > 0 ? await postsRepo.update(existing.id, fields) : existing
    : await postsRepo.upsertByExternalId({
      ...fields,
      // Guaranteed by `requireCreateFields` on this branch.
      contentHtml: fields.contentHtml!,
      authorId: author.id,
      externalId,
    });

  // Only reachable when the post was deleted between the lookup and the write.
  if (!post) throw conflict("That post was removed while this update was in flight.");

  // Ingested posts get the same readable permalink as ones written here, from
  // the same title. `externalId` is the CMS's key for its own document and
  // never appears in a URL.
  if (post.title !== existing?.title || !post.slug) post.slug = await syncSlug(post);

  // Tags are replaced wholesale when the payload carries the field; omitting it
  // leaves whatever the post already has, and `[]` clears them.
  if (payload.tags !== undefined) {
    await tagsRepo.setPostTags(post.id, resolveTags(payload.tags));
  }

  // Federation, mirroring services/posts.ts: a published post fans out — as an
  // Update when remote instances already hold a copy, otherwise a Create — and
  // unpublishing one tombstones the copies already delivered.
  const wasPublished = existing?.status === "published";
  if (post.status === "published") {
    queue.add("federate_post", { postId: post.id, action: wasPublished ? "update" : "create" });
  } else if (wasPublished) {
    queue.add("federate_post_delete", { postId: post.id, authorId: author.id });
  }

  return { id: post.id, slug: externalId, status: post.status, created: !existing };
}

// The HTML an auto-derived summary is read from: the body this request brings,
// else the one already stored. One of the two always exists — a create must
// carry a body, and an update has a row behind it.
function summarySource(fields: Partial<NewPost>, existing: { contentHtml: string } | undefined) {
  return fields.contentHtml ?? existing?.contentHtml ?? "";
}
