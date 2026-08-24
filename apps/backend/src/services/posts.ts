import * as followsRepo from "@/db/repositories/follows.ts";
// SPDX-License-Identifier: AGPL-3.0-or-later
import * as postsRepo from "@/db/repositories/posts.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { normalizeCoverCredit, normalizeCoverUrl } from "@/lib/cover.ts";
import { diversify, freshDiversityState } from "@/lib/feedDiversity.ts";
import { badRequest, forbidden, notFound } from "@/lib/http.ts";
import { type LanguageFilter, normalizeLanguage } from "@/lib/languages.ts";
import { type Cursor, DEFAULT_PAGE_SIZE, encodeCursor } from "@/lib/pagination.ts";
import { sanitizePostHtml } from "@/lib/sanitize.ts";
import { MAX_TAGS_PER_POST, normalizeTags } from "@/lib/tags.ts";
import { SUMMARY_LENGTH as MAX_SUMMARY } from "@/lib/webhook.ts";
import { queue } from "@/queue/queue.ts";
import { syncSlug } from "@/services/postSlugs.ts";

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
    throw badRequest(`Post content is too large (limit ${MAX_POST_HTML_LEN.toLocaleString("en-US")} characters).`);
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
function coverFields(coverUrl: string | null | undefined, coverCredit: Record<string, unknown> | null | undefined) {
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

// The three states a local post can be written into. `scheduled` is `draft`
// plus a due time: private and unfederated exactly like a draft, until the
// sweeper publishes it (see services/scheduledPosts.ts).
export type PostStatus = "draft" | "scheduled" | "published";

function resolveStatus(raw: string | undefined, fallback: PostStatus): PostStatus {
  if (raw === undefined) return fallback;
  return raw === "draft" || raw === "scheduled" ? raw : "published";
}

// A schedule must clear the sweeper's tick by a comfortable margin. Anything
// closer than this is really "publish now" wearing a date, and would race the
// sweep it is trying to be ahead of.
const MIN_SCHEDULE_LEAD_MS = 60_000;
// Five years. Not a policy, just a guard against a mistyped year putting a post
// beyond any horizon the author will ever look at again.
const MAX_SCHEDULE_AHEAD_MS = 5 * 365 * 24 * 60 * 60 * 1000;

/**
 * The due time to store for a write, given the state it lands in.
 *
 * Returns `undefined` when the caller's write should not touch the column at
 * all — an edit to a scheduled post that says nothing about its timing must
 * keep the time it already has, or every autosave would silently unschedule it.
 */
function resolvePublishAt(
  status: PostStatus,
  raw: string | null | undefined,
  existing: Date | null,
): Date | null | undefined {
  // Any state but `scheduled` carries no due time; the database enforces this
  // too, so leaving a stale one would be an error rather than an oddity.
  if (status !== "scheduled") return existing === null ? undefined : null;

  if (raw === undefined || raw === null) {
    if (existing) return undefined;
    throw badRequest("Choose when this post should go out.");
  }

  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) throw badRequest("That publish time is not a valid date.");
  const ahead = at.getTime() - Date.now();
  if (ahead < MIN_SCHEDULE_LEAD_MS) {
    throw badRequest("Pick a time at least a minute from now, or publish the post directly.");
  }
  if (ahead > MAX_SCHEDULE_AHEAD_MS) {
    throw badRequest("That publish time is too far in the future.");
  }
  return at;
}

/**
 * Columns to add when a write publishes a post for the first time.
 *
 * A post is dated from when it went live, not from when its draft was started.
 * Without this a draft begun a fortnight ago publishes *into* the timeline a
 * fortnight down, below everything written since, where no reader will reach
 * it. Scheduling makes that the normal case — every scheduled post is an old
 * draft — but it was already true of the Publish button, which is why the rule
 * lives here and is shared by both.
 *
 * Deliberately not applied to an edit of an already-published post: that is
 * what `updated_at` records, and re-dating on every typo fix would reshuffle
 * the whole timeline. `claimDue` stamps the same column for the sweeper's path.
 */
export function firstPublicationFields(
  previous: PostStatus,
  next: PostStatus,
): { createdAt: Date } | Record<never, never> {
  return next === "published" && previous !== "published" ? { createdAt: new Date() } : {};
}

export async function createPost(
  authorId: string,
  input: {
    title?: string;
    contentHtml: string;
    contentJson?: unknown;
    status?: string;
    publishAt?: string | null;
    language?: string | null;
    summary?: string | null;
    coverUrl?: string | null;
    coverCredit?: Record<string, unknown> | null;
    tags?: string[];
  },
) {
  const status = resolveStatus(input.status, "published");
  const publishAt = resolvePublishAt(status, input.publishAt, null) ?? null;

  // Author HTML is rendered with {@html} by the reader — sanitize before store.
  // Sanitizing first means a body of only disallowed markup collapses to empty
  // and is correctly rejected below.
  const html = sanitizePostHtml(input.contentHtml).trim();
  if (!html) throw badRequest("Post content cannot be empty.");
  assertBodyWithinLimit(html);

  // A title is required to publish; drafts may be saved untitled (work in
  // progress). A scheduled post is held to the publishing rule rather than the
  // draft one, because the moment it goes out nobody is watching — an untitled
  // one would fail in the sweeper, hours later, with no one to tell.
  const title = input.title?.trim();
  if (status !== "draft" && !title) throw badRequest("A blog post must have a title.");

  const tags = input.tags !== undefined ? resolveTags(input.tags) : undefined;

  const post = await postsRepo.create({
    authorId,
    title: title || null,
    contentHtml: html,
    contentJson: input.contentJson ?? null,
    status,
    publishAt,
    language: normalizeLanguage(input.language),
    summary: normalizeSummary(input.summary),
    ...coverFields(input.coverUrl, input.coverCredit),
  });

  if (tags !== undefined) await tagsRepo.setPostTags(post.id, tags);

  // The permalink's readable half, allocated from the title (see
  // services/postSlugs.ts). An untitled draft gets none and is addressed by its
  // short id until it is titled.
  post.slug = await syncSlug(post);

  // Only published posts fan out to remote followers; drafts and scheduled
  // posts stay private until they go live.
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
export async function getPostBySlug(username: string, slug: string, viewerId: string | null = null) {
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
  // Anything not yet published — a draft, or a post waiting for its scheduled
  // moment — is private to its author, and anyone else gets a plain not-found.
  // Written as "not published" rather than "is a draft" so that a state added
  // here later is private by default, which is the safe way to be wrong.
  if (row.post.status !== "published" && row.post.authorId !== viewerId) {
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
export async function relatedPosts(postId: string, limit = 3) {
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

export async function listScheduled(authorId: string, cursor: Cursor | null) {
  const rows = await postsRepo.listScheduledByAuthor(authorId, cursor, DEFAULT_PAGE_SIZE);
  return pageOfDue(rows, DEFAULT_PAGE_SIZE);
}

export async function listOwnPublished(authorId: string, cursor: Cursor | null) {
  const rows = await postsRepo.listPublishedByAuthor(authorId, cursor, DEFAULT_PAGE_SIZE);
  return pageOf(rows, DEFAULT_PAGE_SIZE);
}

/** How many posts the author holds in each state — the management tab badges. */
export function ownCounts(authorId: string) {
  return postsRepo.countsByAuthor(authorId);
}

/**
 * The author's own posts in one requested state. One entry point rather than
 * three endpoints, because the management page's three tabs differ only in
 * which state they ask for.
 */
export function listOwn(authorId: string, status: PostStatus, cursor: Cursor | null) {
  if (status === "scheduled") return listScheduled(authorId, cursor);
  if (status === "published") return listOwnPublished(authorId, cursor);
  return listDrafts(authorId, cursor);
}

// Edits a post. Only the author may edit, and only local posts (remote posts
// are owned by their origin instance). Re-enqueues federation for the update.
export async function updatePost(
  authorId: string,
  id: string,
  input: {
    title?: string;
    contentHtml?: string;
    contentJson?: unknown;
    status?: string;
    publishAt?: string | null;
    language?: string | null;
    summary?: string | null;
    coverUrl?: string | null;
    coverCredit?: Record<string, unknown> | null;
    tags?: string[];
  },
) {
  const row = await postsRepo.findById(id);
  if (!row) throw notFound("Post not found.");
  if (row.post.remote) throw forbidden("Federated posts cannot be edited here.");
  if (row.post.authorId !== authorId) throw forbidden("You can only edit your own posts.");

  const previous = row.post.status;
  // An omitted status leaves the post where it is. That is what keeps the
  // composer's autosave safe: it never sends one, so a background write can
  // neither publish a scheduled post early nor quietly unschedule it.
  const status = resolveStatus(input.status, previous);

  // Scheduling an already-live post would have to unpublish it first, which is
  // not what anyone means by "schedule this" — they mean a staged revision,
  // which needs somewhere to keep the revision and is a separate feature.
  // Refusing plainly beats silently pulling a published post off the site.
  if (previous === "published" && status === "scheduled") {
    throw badRequest("This post is already published. Turn it back into a draft first if you want to schedule it.");
  }

  const publishAt = resolvePublishAt(status, input.publishAt, row.post.publishAt);

  // Only sanitize when new content is supplied; an omitted field leaves the
  // existing (already-sanitized) body untouched.
  const html = input.contentHtml !== undefined ? sanitizePostHtml(input.contentHtml).trim() : undefined;
  if (input.contentHtml !== undefined && !html) throw badRequest("Post content cannot be empty.");
  if (html !== undefined) assertBodyWithinLimit(html);

  const title = input.title?.trim();
  // Untitled drafts are allowed, but a post must have a title to be published —
  // and a scheduled post is held to the same rule, since by the time it
  // publishes there is nobody around to be told it could not.
  const resolvedTitle = input.title !== undefined ? title || null : row.post.title;
  if (status !== "draft" && !resolvedTitle) {
    throw badRequest("A blog post must have a title.");
  }

  const changes = {
    ...(input.title !== undefined ? { title: title || null } : {}),
    ...(html ? { contentHtml: html, contentJson: input.contentJson ?? null } : {}),
    ...(input.status !== undefined ? { status } : {}),
    ...(publishAt !== undefined ? { publishAt } : {}),
    // Dates the post from when it went live rather than from when its draft was
    // started — see firstPublicationFields.
    ...firstPublicationFields(previous, status),
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

  // Federate only published posts. Going live for the first time (from a draft
  // or, via "publish now", from a schedule) fans out as a Create; edits to an
  // already-published post re-deliver as an Update so remote instances refresh
  // their cached copy.
  if (post.status === "published") {
    const action = previous === "published" ? "update" : "create";
    queue.add("federate_post", { postId: post.id, action });
    // Resubmit on edit as well as on publish: an engine holding the old copy is
    // exactly the case IndexNow exists to shorten.
    queue.add("indexnow_submit", { postId: post.id });
  } else if (previous === "published" && post.authorId) {
    // Unpublishing (published → draft) makes the post private again; tombstone
    // the copies already delivered to remote followers.
    queue.add("federate_post_delete", { postId: post.id, authorId: post.authorId });
  }
  // draft ↔ scheduled needs no federation either way: neither state was ever
  // delivered to anyone, so there is nothing to send and nothing to retract.
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
    nextCursor:
      hasMore && last ? encodeCursor({ createdAt: last.post.createdAt.toISOString(), id: last.post.id }) : null,
  };
}

// Pagination for the scheduled listing, which is ordered by when a post goes
// out rather than when it was written. Same opaque cursor shape as `pageOf` —
// its timestamp half simply carries `publish_at` here, matching
// `afterDueCursor` in the repository.
export function pageOfDue(
  rows: postsRepo.PostWithAuthor[],
  limit: number,
): { items: postsRepo.PostWithAuthor[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      hasMore && last?.post.publishAt
        ? encodeCursor({ createdAt: last.post.publishAt.toISOString(), id: last.post.id })
        : null,
  };
}

export async function listByAuthor(authorId: string, cursor: Cursor | null, viewerId: string | null = null) {
  const rows = await postsRepo.listByAuthor(authorId, viewerId, cursor, DEFAULT_PAGE_SIZE);
  return pageOf(rows, DEFAULT_PAGE_SIZE);
}

// Discovery timelines assemble each page with author diversity (see
// lib/feedDiversity.ts): a wide window is fetched in rank order and posts are
// picked under two caps — never more than two posts by one author in a row,
// and at most ~a fifth of the page per author — so one prolific writer (say,
// an eight-part series) can't make the whole instance look monotonous. The
// cursor advances past every row examined: a held-back post before the page's
// last row is trimmed from this timeline (it stays on profiles, tag pages,
// search and trending), one after it returns with the next page. Each pass
// accepts at least one row, so assembly always progresses.
const FEED_WINDOW = DEFAULT_PAGE_SIZE * 4;

async function diversifiedTimelinePage(
  fetchRows: (cursor: Cursor | null, limit: number) => Promise<postsRepo.PostWithAuthor[]>,
  start: Cursor | null,
): Promise<{ items: postsRepo.PostWithAuthor[]; nextCursor: string | null }> {
  let cursor = start;
  const items: postsRepo.PostWithAuthor[] = [];
  let state = freshDiversityState();
  for (;;) {
    // Repos fetch limit+1; the overflow only signals "more in the DB".
    const rows = await fetchRows(cursor, FEED_WINDOW);
    if (!rows.length) return { items, nextCursor: null };
    const result = diversify(
      rows,
      DEFAULT_PAGE_SIZE - items.length,
      (row) => {
        return row.post.authorId ?? row.post.remoteActorId ?? "";
      },
      state,
    );
    state = result.state;
    items.push(...result.kept);
    const lastScanned = rows[result.scanned - 1];
    if (!lastScanned) return { items, nextCursor: null };
    cursor = { createdAt: lastScanned.post.createdAt.toISOString(), id: lastScanned.post.id };
    const windowDrained = result.scanned >= rows.length;
    const dbDrained = rows.length <= FEED_WINDOW;
    if (items.length >= DEFAULT_PAGE_SIZE) {
      return {
        items,
        nextCursor: !windowDrained || !dbDrained ? encodeCursor(cursor) : null,
      };
    }
    if (windowDrained && dbDrained) return { items, nextCursor: null };
    // Short page with more source behind it — pull the next window.
  }
}

export function globalTimeline(
  cursor: Cursor | null,
  viewerId: string | null = null,
  langFilter: LanguageFilter | null = null,
) {
  return diversifiedTimelinePage((c, limit) => postsRepo.listGlobal(viewerId, c, limit, langFilter), cursor);
}

export function localTimeline(
  cursor: Cursor | null,
  viewerId: string | null = null,
  langFilter: LanguageFilter | null = null,
) {
  return diversifiedTimelinePage((c, limit) => postsRepo.listLocal(viewerId, c, limit, langFilter), cursor);
}

// The discovery rail's "Trending" list: a short, unpaginated set of
// the most engaged posts from the last 30 days, filtered by the viewer's
// mutes/blocks. Rank = (likes×1 + comments×2, without self-votes) /
// (hours+2)^1.5 so fresh engagement outranks stale bulk. See
// db/repositories/posts.ts:listTrending for the documented formula.
export function trending(viewerId: string | null = null, limit = 5) {
  return postsRepo.listTrending(viewerId, limit);
}
