// SPDX-License-Identifier: AGPL-3.0-or-later
import * as postsRepo from "@/db/repositories/posts.ts";
import { slugify } from "@/lib/slug.ts";

// Allocation of the slug half of a post's permalink, `/@author/<slug>`.
//
// Two rules make an id-free URL safe to hand out:
//
//   1. A slug is unique within its author, so `/@author/<slug>` names exactly
//      one post. Collisions take a `-2`, `-3`, … suffix.
//   2. A slug is never reused. When a retitle moves a post to a new slug the
//      old one is filed in `post_slug_history` and stays out of circulation, so
//      a link shared before the retitle can only ever redirect to the post it
//      was originally pointing at — never to somebody's later article that
//      happened to slugify the same way.
//
// Remote posts get no slug: they are addressed by their origin instance's URL,
// and this instance has no say in it. Untitled drafts get none either — there
// is nothing to derive one from — and fall back to their short id, which is
// what every post's URL used to be.

// How many `-n` suffixes to try before giving up on a readable slug. Reached
// only by an author who has published the same title 50 times; past that the
// post keeps its short-id URL rather than growing an ever-longer number.
const MAX_SUFFIX = 50;

// Post ids are v4 UUIDs, so the first block is 32 random bits — the same token
// the pre-slug permalinks used, and enough to disambiguate a title an author
// has somehow exhausted the suffix range for.
function shortId(id: string): string {
  return id.slice(0, 8);
}

/**
 * The slug this post should live at, or null when it should have none.
 *
 * Returns the post's current slug unchanged when the title still slugifies to
 * it, so re-saving a post (or an ingest webhook re-delivering it) is a no-op
 * rather than a walk up the suffix range.
 */
async function allocate(
  post: { id: string; authorId: string; title: string | null; slug?: string | null },
): Promise<string | null> {
  const base = post.title ? slugify(post.title) : "";
  if (!base) return null;

  // The post's own slugs never block it: keeping `hello-world` on an edit that
  // did not touch the title must not push it to `hello-world-2`.
  const taken = await postsRepo.slugsLike(post.authorId, base, post.id);
  if (!taken.has(base)) return base;
  for (let n = 2; n <= MAX_SUFFIX; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${shortId(post.id)}`;
}

/**
 * Give a post the slug its title implies, moving it off its previous one (which
 * keeps redirecting) if the title changed. A no-op for a post that should have
 * no slug, so callers can invoke it unconditionally after any write.
 *
 * Returns the slug now in force, or null when the post has none.
 *
 * Never throws: a permalink that stays at its short-id form is a working URL,
 * and losing an author's publish over a slug would not be.
 */
export async function syncSlug(
  post: { id: string; authorId: string | null; title: string | null; slug?: string | null },
): Promise<string | null> {
  if (!post.authorId) return null;
  const authorId = post.authorId;
  try {
    const slug = await allocate({ ...post, authorId });
    if (!slug || slug === post.slug) return slug ?? post.slug ?? null;
    // Two concurrent writes can allocate the same slug — both read the same
    // taken-set before either inserts. The unique index catches the loser, and
    // a second pass sees the winner's row and picks the next suffix.
    try {
      await postsRepo.setSlug(post.id, authorId, slug);
      return slug;
    } catch {
      const retry = await allocate({ ...post, authorId });
      if (!retry) return post.slug ?? null;
      await postsRepo.setSlug(post.id, authorId, retry);
      return retry;
    }
  } catch (err) {
    console.error(`Could not assign a slug to post ${post.id}:`, err);
    return post.slug ?? null;
  }
}

// One boot's worth of backfill. Large enough to finish any realistic instance
// in a single start, bounded so a pathological database cannot hold the process
// at the door — whatever is left is picked up by the next restart, and until
// then those posts serve their old id-suffixed URLs.
const BACKFILL_LIMIT = 20000;

/**
 * Give every pre-existing titled post a slug, once, at boot.
 *
 * This is a migration, but it cannot be written as SQL: the slug comes from
 * `slugify`, whose transliteration would have to be reimplemented in PL/pgSQL
 * and would then drift from the copy the editor and the sitemap use. Running it
 * here keeps exactly one definition of what a title's slug is.
 *
 * Idempotent and cheap when there is nothing to do — one indexed query against
 * `slug is null`. Old links keep working either way: a post's short id resolves
 * whether or not it has been given a slug yet.
 */
export async function backfillSlugs(): Promise<void> {
  const pending = await postsRepo.listWithoutSlug(BACKFILL_LIMIT);
  if (pending.length === 0) return;

  const start = Date.now();
  let done = 0;
  // Sequential, not parallel: allocation reads the slugs an author already has,
  // so two of the same author's posts running at once would both see the base
  // slug free and one would lose the insert. This runs once per instance.
  for (const post of pending) {
    const slug = await syncSlug(post);
    if (slug) done++;
  }
  console.log(`✔ Backfilled ${done} post slug(s) (${Date.now() - start}ms).`);
}
