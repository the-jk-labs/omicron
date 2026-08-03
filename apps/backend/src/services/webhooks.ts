// SPDX-License-Identifier: AGPL-3.0-or-later
import * as postsRepo from "@/db/repositories/posts.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { resolveTags } from "@/services/posts.ts";
import { badRequest, conflict, HttpError, unauthorized } from "@/lib/http.ts";
import { renderMarkdown } from "@/lib/markdown.ts";
import { normalizeLanguage } from "@/lib/languages.ts";
import {
  type ContentPayload,
  externalKey,
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
 * Authenticates an ingestion request. Throws 503 when no secret is configured
 * (the endpoint is off, not open) and 401 when the presented token is wrong.
 *
 * Neither the configured secret nor the presented one ever reaches the thrown
 * message, so nothing sensitive escapes through the error response or through
 * `handleError`'s log.
 */
export async function authenticate(headers: Headers): Promise<void> {
  const expected = config.WEBHOOK_SECRET;
  if (!expected) {
    throw new HttpError(503, "Content ingestion is not configured on this instance.");
  }
  if (!await secretMatches(presentedSecret(headers), expected)) {
    throw unauthorized("Invalid webhook credentials.");
  }
}

// Resolves the local account ingested posts are attributed to. `WEBHOOK_AUTHOR`
// pins it by username; otherwise the oldest account (the admin the setup wizard
// creates) owns them, so a single-author instance configures nothing but the
// secret.
async function resolveAuthor(): Promise<User> {
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
export async function ingestContent(payload: ContentPayload): Promise<IngestResult> {
  const author = await resolveAuthor();
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
  const existing = await postsRepo.findByExternalId(externalId);

  // An external key can only ever address the post it created. A remote post
  // could never carry one, but guard the invariant rather than trust it.
  if (existing && (existing.remote || existing.authorId !== author.id)) {
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
