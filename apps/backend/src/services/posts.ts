// SPDX-License-Identifier: AGPL-3.0-or-later
import * as postsRepo from "@/db/repositories/posts.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import { type Cursor, DEFAULT_PAGE_SIZE, encodeCursor } from "@/lib/pagination.ts";
import { badRequest, forbidden, notFound } from "@/lib/http.ts";
import { MAX_TAGS_PER_POST, normalizeTags } from "@/lib/tags.ts";
import { type LanguageFilter, normalizeLanguage } from "@/lib/languages.ts";
import { sanitizePostHtml } from "@/lib/sanitize.ts";
import { normalizeCoverCredit, normalizeCoverUrl } from "@/lib/cover.ts";
import { SUMMARY_LENGTH as MAX_SUMMARY } from "@/lib/webhook.ts";
import { syncSlug } from "@/services/postSlugs.ts";
import { queue } from "@/queue/queue.ts";

// Business logic for posts. Creating a local post enqueues federation delivery.

// Upper bound on a stored post body, in characters of sanitized HTML. Generous
// — a very long illustrated article is well under this — but finite, so a
// signed-in author (or a stolen session) can't push an unbounded string through
// the sanitizer and into a row as a storage-exhaustion vector. Images are
// referenced by URL, never inlined, so real posts stay far below it. Mirrors the
// byte caps the ingest webhook (WEBHOOK_MAX_BODY_BYTES) and the profile custom
// section (MAX_CUSTOM_SECTION_LEN) already enforce on their own write paths.
const MAX_POST_HTML_LEN = 1_000_000;

// Rejects an over-long body. Checked after sanitizing, on the value that will
// actually be stored and served, so padding that the sanitizer strips doesn't
// count against the author.
function assertBodyWithinLimit(html: string): void {
  if (html.length > MAX_POST_HTML_LEN) {
    throw badRequest(
      `Post content is too large (limit ${MAX_POST_HTML_LEN.toLocaleString("en-US")} characters).`,
    );
  }
}

// The author's own one-line description of a post.
//
// This is what a search engine prints under the title in results, and what a
// link preview shows — the sentence that decides whether anyone clicks. Until
// now only the ingest webhook could set it, so a post written in the editor
// fell back to a mechanical truncation of its opening paragraph, frequently
// cut mid-clause.
//
// Capped at the same length the ingest path derives to, so both routes into the
// database agree and neither can store a "description" long enough to be
// clipped by every engine that shows it. Empty is stored as null, which is the
// reader's signal to fall back to the derived excerpt.
export function normalizeSummary(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length > MAX_SUMMARY) {
    throw badRequest(`A description can be at most ${MAX_SUMMARY} characters.`);
  }
  return text;
}

// The banner columns for a write, from what the author chose in the editor.
//
// The credit belongs to the image, so the two always move together: clearing
// the banner clears the credit, and replacing an Unsplash photo with an upload
// (which needs no attribution) drops the photographer's name with it. Sending
// one without the other could otherwise leave a post crediting someone for a
// picture it no longer shows.
function coverFields(
  coverUrl: string | null | undefined,
  coverCredit: Record<string, unknown> | null | undefined,
) {
  const url = normalizeCoverUrl(coverUrl);
  return { coverUrl: url, coverCredit: url ? normalizeCoverCredit(coverCredit) : null };
}

// Normalizes and validates author-supplied tags, capping the count per post.
// Exported so every write path that accepts tags — the editor here, ingested
// content in services/webhooks.ts — enforces the same cap.
export function resolveTags(raw: string[]): string[] {
  const slugs = normalizeTags(raw);
  if (slugs.length > MAX_TAGS_PER_POST) {
    throw badRequest(`A post can have at most ${MAX_TAGS_PER_POST} tags.`);
  }
  return slugs;
}

export async function createPost(authorId: string, input: {
  title?: string;
  contentHtml: string;
  contentJson?: unknown;
  status?: string;
  language?: string | null;
  summary?: string | null;
  coverUrl?: string | null;
  coverCredit?: Record<string, unknown> | null;
  tags?: string[];
}) {
  const status = input.status === "draft" ? "draft" : "published";

  // Author HTML is rendered with {@html} by the reader — sanitize before store.
  // Sanitizing first means a body of only disallowed markup collapses to empty
  // and is correctly rejected below.
  const html = sanitizePostHtml(input.contentHtml).trim();
  if (!html) throw badRequest("Post content cannot be empty.");
  assertBodyWithinLimit(html);

  // A title is required to publish; drafts may be saved untitled (work in progress).
  const title = input.title?.trim();
  if (status === "published" && !title) throw badRequest("A blog post must have a title.");

  const tags = input.tags !== undefined ? resolveTags(input.tags) : undefined;

  const post = await postsRepo.create({
    authorId,
    title: title || null,
    contentHtml: html,
    contentJson: input.contentJson ?? null,
    status,
    language: normalizeLanguage(input.language),
    summary: normalizeSummary(input.summary),
    ...coverFields(input.coverUrl, input.coverCredit),
  });

  if (tags !== undefined) await tagsRepo.setPostTags(post.id, tags);

  // The permalink's readable half, allocated from the title (see
  // services/postSlugs.ts). An untitled draft gets none and is addressed by its
  // short id until it is titled.
  post.slug = await syncSlug(post);

  // Only published posts fan out to remote followers; drafts stay private.
  if (status === "published") {
    queue.add("federate_post", { postId: post.id });
    queue.add("indexnow_submit", { postId: post.id });
  }
  return post;
}

export async function getPost(id: string, viewerId: string | null = null) {
  // `id` is a full UUID or a hex id-prefix from a canonical URL; reject anything
  // else so LIKE wildcards can't reach the query.
  if (!/^[0-9a-f-]{8,}$/i.test(id)) throw notFound("Post not found.");
  const row = await postsRepo.findById(id);
  if (!row) throw notFound("Post not found.");
  return assertVisible(row, viewerId);
}

// A trailing short id in a `[slug]` route param — what a permalink shared
// before readable slugs existed carries (`some-title-9e962281`), and what an
// untitled or remote post's URL is made of on its own. The leading dash is
// optional so both forms match.
const TRAILING_SHORT_ID = /(?:^|-)([0-9a-f]{8,})$/i;

/**
 * Resolve `/@username/<slug>` to a post, in the order a reader's link can mean
 * things:
 *
 *   1. the author's live slug — the canonical URL, one indexed lookup;
 *   2. a slug the post has been moved off (`post_slug_history`), so a link
 *      shared before a retitle still arrives;
 *   3. a trailing short id, which is what every permalink looked like before
 *      slugs and what remote and untitled posts still use.
 *
 * The live slug is tried first so a post whose title genuinely slugifies to
 * something ending in hex is reachable at its own address rather than being
 * read as an id. The caller compares what it got back against the canonical
 * path and redirects when they differ, which is what turns (2) and (3) into
 * permanent redirects to the current URL.
 */
export async function getPostBySlug(
  username: string,
  slug: string,
  viewerId: string | null = null,
) {
  const bySlug = await postsRepo.findByAuthorSlug(username, slug);
  if (bySlug) return assertVisible(bySlug, viewerId);

  const retiredId = await postsRepo.findIdByHistorySlug(username, slug);
  if (retiredId) {
    const row = await postsRepo.findById(retiredId);
    if (row) return assertVisible(row, viewerId);
  }

  const shortId = slug.match(TRAILING_SHORT_ID)?.[1];
  if (shortId) return getPost(shortId.toLowerCase(), viewerId);

  throw notFound("Post not found.");
}

// Who may read a single post. Feeds filter in SQL (visibleToViewer); a direct
// permalink is gated here, whichever way the reader addressed it.
async function assertVisible(row: postsRepo.PostWithAuthor, viewerId: string | null) {
  // Drafts are private to their author — anyone else gets a plain not-found.
  if (row.post.status === "draft" && row.post.authorId !== viewerId) {
    throw notFound("Post not found.");
  }
  // A block hides the two users' posts from each other everywhere — including a
  // direct link to a single post. Local authors are bidirectional; remote
  // authors can only be blocked by the local viewer.
  if (viewerId) {
    const blocked = row.post.authorId
      ? await relationsRepo.localBlockExists(viewerId, row.post.authorId)
      : row.post.remoteActorId
      ? await relationsRepo.hasRemote("block", viewerId, row.post.remoteActorId)
      : false;
    if (blocked) throw notFound("Post not found.");
  }
  // Private accounts: a post by a private local author is visible only to the
  // author and their approved followers. Feeds/profile enforce this in SQL
  // (visibleToViewer); a direct permalink is gated here.
  if (row.post.authorId && row.post.authorId !== viewerId) {
    const author = await usersRepo.findById(row.post.authorId);
    if (author?.isPrivate) {
      const allowed = viewerId ? await followsRepo.isFollowing(viewerId, row.post.authorId) : false;
      if (!allowed) throw notFound("Post not found.");
    }
  }
  return row;
}

// Posts to offer at the end of an article. Tag overlap first; when a post
// shares tags with nothing (or carries none), the newest posts stand in, so the
// reader is never left at a dead end. Deduplicated by id because the fallback
// is only topped up when the related set comes back short.
export async function relatedPosts(postId: string, limit = 4) {
  const related = await postsRepo.listRelated(postId, limit);
  if (related.length >= limit) return related;

  const seen = new Set(related.map((r) => r.post.id));
  const filler = await postsRepo.listRecentExcluding(postId, limit + related.length);
  for (const row of filler) {
    if (related.length >= limit) break;
    if (seen.has(row.post.id)) continue;
    seen.add(row.post.id);
    related.push(row);
  }
  return related;
}

export async function listDrafts(authorId: string, cursor: Cursor | null) {
  const rows = await postsRepo.listDraftsByAuthor(authorId, cursor, DEFAULT_PAGE_SIZE);
  return pageOf(rows, DEFAULT_PAGE_SIZE);
}

// Edits a post. Only the author may edit, and only local posts (remote posts
// are owned by their origin instance). Re-enqueues federation for the update.
export async function updatePost(authorId: string, id: string, input: {
  title?: string;
  contentHtml?: string;
  contentJson?: unknown;
  status?: string;
  language?: string | null;
  summary?: string | null;
  coverUrl?: string | null;
  coverCredit?: Record<string, unknown> | null;
  tags?: string[];
}) {
  const row = await postsRepo.findById(id);
  if (!row) throw notFound("Post not found.");
  if (row.post.remote) throw forbidden("Federated posts cannot be edited here.");
  if (row.post.authorId !== authorId) throw forbidden("You can only edit your own posts.");

  const status = input.status === undefined
    ? row.post.status
    : input.status === "draft"
    ? "draft"
    : "published";

  // Only sanitize when new content is supplied; an omitted field leaves the
  // existing (already-sanitized) body untouched.
  const html = input.contentHtml !== undefined
    ? sanitizePostHtml(input.contentHtml).trim()
    : undefined;
  if (input.contentHtml !== undefined && !html) throw badRequest("Post content cannot be empty.");
  if (html !== undefined) assertBodyWithinLimit(html);

  const title = input.title?.trim();
  // Untitled drafts are allowed, but a post must have a title to be published.
  const resolvedTitle = input.title !== undefined ? (title || null) : row.post.title;
  if (status === "published" && !resolvedTitle) {
    throw badRequest("A blog post must have a title.");
  }

  const changes = {
    ...(input.title !== undefined ? { title: title || null } : {}),
    ...(html ? { contentHtml: html, contentJson: input.contentJson ?? null } : {}),
    ...(input.status !== undefined ? { status } : {}),
    ...(input.language !== undefined ? { language: normalizeLanguage(input.language) } : {}),
    ...(input.summary !== undefined ? { summary: normalizeSummary(input.summary) } : {}),
    // `coverUrl` present is the whole banner decision, credit included — an
    // editor that sends the field always sends both, and one that sends
    // neither (the ingest webhook's partial updates) leaves the row alone.
    ...(input.coverUrl !== undefined ? coverFields(input.coverUrl, input.coverCredit) : {}),
  };

  // A tags-only edit touches no post columns; skip the update (drizzle rejects
  // an empty SET) and keep the existing row.
  const touchedColumns = Object.keys(changes).length > 0;
  const post = touchedColumns ? await postsRepo.update(id, changes) : row.post;

  // A retitle moves the post to a new slug and leaves the old one redirecting,
  // so a link shared under the previous title still lands here. Only worth a
  // query when the title actually changed.
  if (post.title !== row.post.title) post.slug = await syncSlug(post);

  // Tags are replaced wholesale when provided; an empty array clears them.
  if (input.tags !== undefined) {
    await tagsRepo.setPostTags(post.id, resolveTags(input.tags));
    // A tags-only edit writes to the join table alone, so it never reached
    // `update()` above and `updated_at` would still read as the publish date —
    // leaving the sitemap claiming nothing had changed. Stamp it here instead.
    if (!touchedColumns) await postsRepo.touch(post.id);
  }

  // Federate only published posts. Publishing a draft (draft → published) fans
  // out for the first time as a Create; edits to an already-published post
  // re-deliver as an Update so remote instances refresh their cached copy.
  if (post.status === "published") {
    const action = row.post.status === "published" ? "update" : "create";
    queue.add("federate_post", { postId: post.id, action });
    // Resubmit on edit as well as on publish: an engine holding the old copy is
    // exactly the case IndexNow exists to shorten.
    queue.add("indexnow_submit", { postId: post.id });
  } else if (row.post.status === "published" && post.authorId) {
    // Unpublishing (published → draft) makes the post private again; tombstone
    // the copies already delivered to remote followers.
    queue.add("federate_post_delete", { postId: post.id, authorId: post.authorId });
  }
  return post;
}

// Deletes a post. The author or an admin may delete; only local posts.
export async function deletePost(userId: string, isAdmin: boolean, id: string) {
  const row = await postsRepo.findById(id);
  if (!row) throw notFound("Post not found.");
  if (row.post.remote) throw forbidden("Federated posts cannot be deleted here.");
  if (row.post.authorId !== userId && !isAdmin) {
    throw forbidden("You can only delete your own posts.");
  }

  // Capture before removal — federation delivery needs the author, and the row
  // is about to vanish. Only published posts were ever federated.
  const wasPublished = row.post.status === "published";
  const authorId = row.post.authorId;
  await postsRepo.remove(id);

  // Tombstone the post on remote followers' instances (author-owned Delete;
  // works for admin takedowns too, delivered on the original author's behalf).
  if (wasPublished && authorId) {
    queue.add("federate_post_delete", { postId: id, authorId });
  }
}

// Pagination over the nested {post, author} rows returned by the repo.
export function pageOf(
  rows: postsRepo.PostWithAuthor[],
  limit: number,
): { items: postsRepo.PostWithAuthor[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last
      ? encodeCursor({ createdAt: last.post.createdAt.toISOString(), id: last.post.id })
      : null,
  };
}

export async function listByAuthor(
  authorId: string,
  cursor: Cursor | null,
  viewerId: string | null = null,
) {
  const rows = await postsRepo.listByAuthor(authorId, viewerId, cursor, DEFAULT_PAGE_SIZE);
  return pageOf(rows, DEFAULT_PAGE_SIZE);
}

export async function globalTimeline(
  cursor: Cursor | null,
  viewerId: string | null = null,
  langFilter: LanguageFilter | null = null,
) {
  const rows = await postsRepo.listGlobal(viewerId, cursor, DEFAULT_PAGE_SIZE, langFilter);
  return pageOf(rows, DEFAULT_PAGE_SIZE);
}

export async function localTimeline(
  cursor: Cursor | null,
  viewerId: string | null = null,
  langFilter: LanguageFilter | null = null,
) {
  const rows = await postsRepo.listLocal(viewerId, cursor, DEFAULT_PAGE_SIZE, langFilter);
  return pageOf(rows, DEFAULT_PAGE_SIZE);
}

// The discovery rail's "Trending" list — a short, unpaginated set of the most
// engaged recent posts, filtered by the viewer's mutes/blocks.
export function trending(viewerId: string | null = null, limit = 5) {
  return postsRepo.listTrending(viewerId, limit);
}
