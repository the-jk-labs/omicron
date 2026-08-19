// SPDX-License-Identifier: AGPL-3.0-or-later
import { type Context, Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import * as postsService from "@/services/posts.ts";
import * as likesService from "@/services/likes.ts";
import * as recommendationsService from "@/services/recommendations.ts";
import * as commentsService from "@/services/comments.ts";
import * as commentLikesService from "@/services/commentLikes.ts";
import { enrichPost, enrichPosts } from "@/services/engagement.ts";
import * as analyticsService from "@/services/analytics.ts";
import { isBot, readerOptedOut, VIEW_COOKIE, VIEW_COOKIE_TTL_MS } from "@/lib/analytics.ts";
import { cookieSecure } from "@/lib/session.ts";
import { decodeCursor } from "@/lib/pagination.ts";
import { parseLanguageFilter } from "@/lib/languages.ts";
import { requireUser } from "@/routes/middleware.ts";
import { barePost, commentView } from "@/routes/serializers.ts";
import { config } from "@/config.ts";
import { jsonBody } from "@/lib/validate.ts";
import { z } from "zod";
import type { AppEnv } from "@/routes/types.ts";

export const postRoutes = new Hono<AppEnv>();

// `secure` is decided per request from the forwarded scheme (lib/session.ts
// cookieSecure), matching the session cookie, so this is Secure on a
// wizard-configured HTTPS instance rather than keyed to the boot-time domain.
function viewCookieOpts(c: Context<AppEnv>) {
  return {
    httpOnly: true,
    sameSite: "Lax" as const,
    path: "/",
    secure: cookieSecure(c, config.APP_DOMAIN),
    maxAge: VIEW_COOKIE_TTL_MS / 1000,
  };
}

// Timeline (public). `?scope=local` returns only posts from this instance;
// otherwise the global blog feed across the fediverse.
postRoutes.get("/", async (c) => {
  const viewer = c.get("user");
  const cursor = decodeCursor(c.req.query("cursor"));
  // Optional reader-supplied language filter (`?langMode=show|hide&langs=en,tr`).
  const langFilter = parseLanguageFilter(c.req.query("langMode"), c.req.query("langs"));
  const { items, nextCursor } = c.req.query("scope") === "local"
    ? await postsService.localTimeline(cursor, viewer?.id ?? null, langFilter)
    : await postsService.globalTimeline(cursor, viewer?.id ?? null, langFilter);
  return c.json({ items: await enrichPosts(items, viewer?.id ?? null), nextCursor });
});

// The editor's payload. Every field is optional except the body itself, so a
// draft can be saved with nothing but content; the service applies the rules
// that need more than a shape (a title is required to publish, the body must be
// non-empty once sanitized).
const createPostSchema = z.object({
  title: z.string().optional(),
  contentHtml: z.string(),
  contentJson: z.unknown().optional(),
  status: z.enum(["draft", "scheduled", "published"]).optional(),
  // ISO instant a `scheduled` post goes out. The service owns the rules that
  // need more than a shape — that it parses, is far enough ahead of the
  // sweeper, and is required by (and only by) the scheduled state.
  publishAt: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  coverUrl: z.string().nullable().optional(),
  coverCredit: z.record(z.string(), z.unknown()).nullable().optional(),
  tags: z.array(z.string()).optional(),
});

// Create a post (auth required).
postRoutes.post("/", jsonBody(createPostSchema), async (c) => {
  const user = requireUser(c);
  const post = await postsService.createPost(user.id, c.req.valid("json"));
  return c.json({ post: barePost(post) }, 201);
});

// The signed-in author's own drafts (auth required). Registered before "/:id"
// so "drafts" isn't captured as a post id.
postRoutes.get("/drafts", async (c) => {
  const user = requireUser(c);
  const cursor = decodeCursor(c.req.query("cursor"));
  const { items, nextCursor } = await postsService.listDrafts(user.id, cursor);
  return c.json({ items: await enrichPosts(items, user.id), nextCursor });
});

// The signed-in author's own posts in one state — what the three tabs of the
// management page read (auth required). Registered before "/:id" for the same
// reason as "/drafts": otherwise "mine" is captured as a post id.
//
// `/drafts` above is the same listing for `?status=draft` and stays because it
// is a documented part of the HTTP API; this is the general form the newer tabs
// need rather than three near-identical endpoints.
postRoutes.get("/mine", async (c) => {
  const user = requireUser(c);
  const cursor = decodeCursor(c.req.query("cursor"));
  const raw = c.req.query("status");
  const status = raw === "scheduled" || raw === "published" ? raw : "draft";
  const { items, nextCursor } = await postsService.listOwn(user.id, status, cursor);
  return c.json({ items: await enrichPosts(items, user.id), nextCursor });
});

// How many posts the author holds in each state — the tab badges, in one query.
postRoutes.get("/mine/counts", async (c) => {
  const user = requireUser(c);
  return c.json(await postsService.ownCounts(user.id));
});

// Trending posts (public) — the discovery rail's short "Trending" list.
// Registered before "/:id" so "trending" isn't captured as a post id.
postRoutes.get("/trending", async (c) => {
  const viewer = c.get("user");
  const items = await postsService.trending(viewer?.id ?? null);
  return c.json({ items: await enrichPosts(items, viewer?.id ?? null) });
});

// Count an on-instance view of a local published post. Fire-and-forget and
// privacy-gated inside the service (DNT/GPC, bots, instance opt-out); it must
// never delay or fail serving the page. Drafts and remote posts are skipped.
// Shared by both ways of addressing a post, so a reader arriving by permalink
// counts the same as one arriving by id.
function countView(c: Context<AppEnv>, row: { post: { id: string } }) {
  const viewer = c.get("user");
  const headers = c.req.raw.headers;
  let anonCookie = getCookie(c, VIEW_COOKIE) ?? null;
  // Only issue the anonymous reader cookie to readers who could actually be
  // counted — never to an opted-out or bot request, so nothing is set for
  // traffic we're not going to track anyway.
  if (
    !viewer && !anonCookie && !readerOptedOut(headers) && !isBot(headers.get("user-agent") ?? "")
  ) {
    anonCookie = crypto.randomUUID() + crypto.randomUUID();
    setCookie(c, VIEW_COOKIE, anonCookie, viewCookieOpts(c));
  }
  analyticsService.recordPostView(row.post.id, headers, viewer?.id ?? null, anonCookie).catch(
    () => {},
  );
}

// A post by its permalink, `/@username/<slug>` (public). Resolves the live
// slug, then a retired one, then a trailing short id, so every permalink this
// instance has ever issued still lands on the right post — see
// postsService.getPostBySlug. Registered before "/:id" so "by" is not read as
// a post id.
postRoutes.get("/by/:username/:slug", async (c) => {
  const viewer = c.get("user");
  const row = await postsService.getPostBySlug(
    c.req.param("username"),
    c.req.param("slug"),
    viewer?.id ?? null,
  );
  if (row.post.authorId && row.post.status === "published") countView(c, row);
  return c.json({ post: await enrichPost(row, viewer?.id ?? null) });
});

// Single post (public). Drafts are visible only to their author.
postRoutes.get("/:id", async (c) => {
  const viewer = c.get("user");
  const row = await postsService.getPost(c.req.param("id"), viewer?.id ?? null);
  if (row.post.authorId && row.post.status === "published") countView(c, row);
  return c.json({ post: await enrichPost(row, viewer?.id ?? null) });
});

// Posts to read next (public). Sits under the article and is what stops a post
// page being a dead end for readers and crawlers alike.
postRoutes.get("/:id/related", async (c) => {
  const viewer = c.get("user");
  const row = await postsService.getPost(c.req.param("id"), viewer?.id ?? null);
  const items = await postsService.relatedPosts(row.post.id);
  return c.json({ items: await enrichPosts(items, viewer?.id ?? null) });
});

// An edit sends only what changed, so every field is optional — including the
// body, which a title-only or tag-only edit leaves out. Derived from the create
// schema so the two cannot describe different fields.
const updatePostSchema = createPostSchema.partial();

// Edit a post (auth required; author only, local posts only).
postRoutes.patch("/:id", jsonBody(updatePostSchema), async (c) => {
  const user = requireUser(c);
  const post = await postsService.updatePost(user.id, c.req.param("id"), c.req.valid("json"));
  return c.json({ post: barePost(post) });
});

// Delete a post (auth required; author or admin, local posts only).
postRoutes.delete("/:id", async (c) => {
  const user = requireUser(c);
  await postsService.deletePost(user.id, user.isAdmin, c.req.param("id"));
  return c.json({ ok: true });
});

// Like / unlike a post (auth required). Returns fresh like stats.
postRoutes.post("/:id/like", async (c) => {
  const user = requireUser(c);
  const stats = await likesService.like(user.id, c.req.param("id"));
  return c.json({ likeCount: stats.count, liked: stats.liked });
});

postRoutes.delete("/:id/like", async (c) => {
  const user = requireUser(c);
  const stats = await likesService.unlike(user.id, c.req.param("id"));
  return c.json({ likeCount: stats.count, liked: stats.liked });
});

// Recommend / un-recommend a post ("repost"; auth required). Federates as an
// ActivityPub Announce/Undo(Announce). Returns fresh recommend stats.
postRoutes.post("/:id/recommend", async (c) => {
  const user = requireUser(c);
  const stats = await recommendationsService.recommend(user.id, c.req.param("id"));
  return c.json({ recommendCount: stats.count, recommended: stats.recommended });
});

postRoutes.delete("/:id/recommend", async (c) => {
  const user = requireUser(c);
  const stats = await recommendationsService.unrecommend(user.id, c.req.param("id"));
  return c.json({ recommendCount: stats.count, recommended: stats.recommended });
});

// Comments (list public, create requires auth).
postRoutes.get("/:id/comments", async (c) => {
  const viewer = c.get("user");
  const cursor = decodeCursor(c.req.query("cursor"));
  const { items, nextCursor } = await commentsService.list(
    c.req.param("id"),
    cursor,
    viewer?.id ?? null,
  );
  return c.json({ items: items.map(commentView), nextCursor });
});

const createCommentSchema = z.object({
  content: z.string(),
  // Present when replying to another comment; absent or null on a top-level one.
  parentId: z.string().nullable().optional(),
});

postRoutes.post("/:id/comments", jsonBody(createCommentSchema), async (c) => {
  const user = requireUser(c);
  const body = c.req.valid("json");
  const comment = await commentsService.create(
    user.id,
    c.req.param("id"),
    body.content,
    body.parentId ?? null,
  );
  return c.json({
    comment: commentView({
      comment,
      author: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
    }),
  }, 201);
});

// Edit a comment (auth required; author only).
postRoutes.patch(
  "/:id/comments/:commentId",
  jsonBody(z.object({ content: z.string() })),
  async (c) => {
    const user = requireUser(c);
    const comment = await commentsService.edit(
      user.id,
      c.req.param("commentId"),
      c.req.valid("json").content,
    );
    return c.json({ comment: { id: comment.id, content: comment.content } });
  },
);

// Delete a comment (auth required; author or admin only).
postRoutes.delete("/:id/comments/:commentId", async (c) => {
  const user = requireUser(c);
  await commentsService.remove(user.id, user.isAdmin, c.req.param("commentId"));
  return c.json({ ok: true });
});

// Like / unlike a comment (auth required). Returns fresh like stats.
postRoutes.post("/:id/comments/:commentId/like", async (c) => {
  const user = requireUser(c);
  const stats = await commentLikesService.like(user.id, c.req.param("commentId"));
  return c.json({ likeCount: stats.count, liked: stats.liked });
});

postRoutes.delete("/:id/comments/:commentId/like", async (c) => {
  const user = requireUser(c);
  const stats = await commentLikesService.unlike(user.id, c.req.param("commentId"));
  return c.json({ likeCount: stats.count, liked: stats.liked });
});
