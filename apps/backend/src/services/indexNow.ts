// SPDX-License-Identifier: AGPL-3.0-or-later
import { config } from "@/config.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { getSeoSettings } from "@/services/seo.ts";

// IndexNow: tell participating search engines that a URL changed, instead of
// waiting for them to come and find out.
//
// A sitemap says "here is everything, come back sometime". This says "this one
// page, now". Bing, Yandex, Seznam and Naver honour it and share submissions
// between themselves, so one call reaches all of them. Google does not
// participate — their Indexing API is restricted to job postings and
// livestreams, and using it for blog posts is against its terms, so nothing
// here tries to.
//
// Off unless an admin turns it on (see services/seo.ts). Enabling it means this
// instance sends its URLs to third-party servers on every publish; that is a
// fair trade for an operator who wants it, and not something to do on their
// behalf uninvited.

const ENDPOINT = "https://api.indexnow.org/IndexNow";

// A publish should never be held up, or failed, by a third party being slow or
// down. Everything below is best-effort: a rejected or timed-out submission
// costs nothing but the next crawl arriving on its own schedule.
const TIMEOUT_MS = 5000;

/** Canonical public path for a post — mirrors the frontend's `postPath`. */
export function postPath(
  post: { id: string; title: string | null; slug: string | null },
  username: string,
): string {
  // The stored slug is the post's address; a post without one (untitled, or not
  // yet reached by the boot backfill) is addressed by its short id, as every
  // post was before slugs existed.
  return `/@${username}/${post.slug ?? post.id.slice(0, 8)}`;
}

/** Where the engines fetch the key from to confirm we own this host. */
export function keyLocation(origin: string, key: string): string {
  return `${origin}/indexnow-${key}.txt`;
}

function origin(): string | null {
  const host = config.APP_DOMAIN?.trim();
  if (!host || host.startsWith("localhost")) return null;
  return `https://${host}`;
}

/**
 * Submit one post's canonical URL. Safe to call for anything: it resolves
 * whether it should do nothing at all — protection off, indexing off, a draft,
 * a federated post that belongs to another instance, or a local dev host with
 * no public URL for an engine to fetch.
 */
export async function submitPost(postId: string): Promise<void> {
  const site = origin();
  if (!site) return;

  const seo = await getSeoSettings();
  // Indexing being off is the stronger statement of the two: an instance that
  // asks not to be indexed must not then push its URLs at anyone.
  if (!seo.indexNowEnabled || !seo.indexingEnabled || !seo.indexNowKey) return;

  const row = await postsRepo.findById(postId);
  if (!row?.post || row.post.remote || row.post.status !== "published") return;
  if (!row.post.authorId) return;

  const author = await usersRepo.findById(row.post.authorId);
  if (!author || author.suspendedAt || author.isPrivate) return;

  await submit([`${site}${postPath(row.post, author.username)}`], site, seo.indexNowKey);
}

async function submit(urlList: string[], site: string, key: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      signal: controller.signal,
      body: JSON.stringify({
        host: new URL(site).host,
        key,
        keyLocation: keyLocation(site, key),
        urlList,
      }),
    });
    // 200 and 202 are both success; anything else is worth a line in the log,
    // since a persistently rejected key is invisible otherwise.
    if (!res.ok && res.status !== 202) {
      console.warn(`IndexNow submission rejected (${res.status}) for ${urlList.join(", ")}`);
    }
  } catch (err) {
    console.warn(`IndexNow submission failed: ${err instanceof Error ? err.message : err}`);
  } finally {
    clearTimeout(timer);
  }
}
