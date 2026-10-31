// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFile, unlink } from "node:fs/promises";
import type { ContentArchive, ContentArchivePost, ContentImportPreview, ContentImportResult } from "@omicron/contract";
import { strToU8, zipSync } from "fflate";
import { config } from "@/config.ts";
import * as portabilityRepo from "@/db/repositories/contentPortability.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as uploadsRepo from "@/db/repositories/uploads.ts";
import type { User } from "@/db/schema.ts";
import {
  bundledImage,
  imageUrls,
  importKey,
  MAX_ARCHIVE_BYTES,
  MAX_ARCHIVE_POSTS,
  MAX_EXPANDED_BYTES,
  parseArchive,
  rewriteImages,
  type ParsedArchive,
} from "@/lib/contentArchive.ts";
import { escapeHtml } from "@/lib/html.ts";
import { badRequest, HttpError } from "@/lib/http.ts";
import { sniffMatches } from "@/lib/imageSignature.ts";
import { sanitizePostHtml } from "@/lib/sanitize.ts";
import { uploadFilenameFromUrl } from "@/lib/uploads.ts";
import { queue } from "@/queue/queue.ts";
import { getOrigin } from "@/services/instanceSetup.ts";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, saveImage } from "@/services/media.ts";
import { syncSlug } from "@/services/postSlugs.ts";

function identity(origin: string, post: { id: string; externalId: string | null }): string {
  return post.externalId?.startsWith("portability:") ? post.externalId : `${origin}/posts/${post.id}`;
}

async function ownKeys(authorId: string): Promise<Set<string>> {
  const origin = await getOrigin();
  return new Set((await portabilityRepo.identities(authorId)).map((post) => importKey(identity(origin, post))));
}

function imageType(path: string, bytes: Uint8Array): string {
  const ext = path.split(".").at(-1)?.toLowerCase();
  const type = Object.entries(IMAGE_TYPES).find(([, extension]) => extension === (ext === "jpeg" ? "jpg" : ext))?.[0];
  if (!type || !bytes.length || bytes.length > MAX_IMAGE_BYTES || !sniffMatches(bytes, IMAGE_TYPES[type])) {
    throw badRequest("A bundled image is invalid, unsupported, or larger than 5 MB.");
  }
  return type;
}

function validateImages(archive: ParsedArchive): Set<string> {
  const images = new Set<string>();
  for (const post of archive.posts) {
    let external = false;
    for (const url of imageUrls(post)) {
      const path = bundledImage(archive, post, url);
      if (path) {
        if (!images.has(path)) imageType(path, archive.files.get(path)!);
        images.add(path);
      } else if (/^https?:\/\//i.test(url)) external = true;
      else throw badRequest(`An image is missing from the archive: ${post.title ?? "Untitled"}.`);
    }
    if (external) post.warnings.push("External images remain linked; they are not downloaded or backed up.");
  }
  return images;
}

export async function preview(authorId: string, bytes: Uint8Array): Promise<ContentImportPreview> {
  const archive = parseArchive(bytes);
  const images = validateImages(archive);
  const keys = await ownKeys(authorId);
  return {
    format: archive.format,
    items: archive.posts.map((post) => ({
      key: post.key,
      title: post.title ?? "Untitled",
      status: post.status,
      createdAt: post.createdAt,
      duplicate: keys.has(post.key),
      warnings: post.warnings,
    })),
    imageCount: images.size,
    warnings: archive.warnings,
  };
}

export async function importContent(
  authorId: string,
  bytes: Uint8Array,
  preservePublished: boolean,
): Promise<ContentImportResult> {
  const archive = parseArchive(bytes);
  validateImages(archive);
  const keys = await ownKeys(authorId);
  const savedImages = new Map<string, string>();
  const usedImages = new Set<string>();
  const result: ContentImportResult = { imported: 0, skipped: 0, failed: [] };
  for (const post of archive.posts) {
    if (keys.has(post.key)) {
      result.skipped++;
      continue;
    }
    try {
      const replacements = new Map<string, string>();
      for (const url of imageUrls(post)) {
        const path = bundledImage(archive, post, url);
        if (!path) continue;
        let saved = savedImages.get(path);
        if (!saved) {
          const image = archive.files.get(path)!;
          saved = await saveImage(authorId, image, imageType(path, image));
          savedImages.set(path, saved);
        }
        replacements.set(url, saved);
      }
      const status =
        preservePublished &&
        post.status === "published" &&
        !post.protected &&
        post.title &&
        new Date(post.createdAt).getTime() <= Date.now()
          ? "published"
          : "draft";
      const created = await portabilityRepo.insertPost(
        {
          authorId,
          externalId: post.key,
          title: post.title,
          contentHtml: sanitizePostHtml(rewriteImages(post.contentHtml, replacements)),
          contentJson: null,
          status,
          publishAt: null,
          createdAt: new Date(post.createdAt),
          updatedAt: new Date(post.updatedAt),
          language: post.language,
          summary: post.summary,
          aiAssisted: post.aiAssisted,
          coverUrl: post.coverUrl ? (replacements.get(post.coverUrl) ?? post.coverUrl) : null,
          coverCredit: post.coverCredit,
        },
        post.tags,
      );
      if (!created) {
        result.skipped++;
        continue;
      }
      for (const url of replacements.values()) usedImages.add(url);
      keys.add(post.key);
      await syncSlug(created);
      if (status === "published") {
        queue.add("federate_post", { postId: created.id });
        queue.add("indexnow_submit", { postId: created.id });
      }
      result.imported++;
    } catch (err) {
      result.failed.push({
        title: post.title ?? "Untitled",
        error:
          err instanceof HttpError
            ? err.message
            : "This post could not be imported. Retry the archive; existing posts will be skipped.",
      });
    }
  }
  // Failed posts must not consume upload quota; GC handles a failed cleanup.
  for (const url of savedImages.values()) {
    if (usedImages.has(url)) continue;
    const filename = uploadFilenameFromUrl(url);
    if (!filename) continue;
    try {
      await unlink(`${config.UPLOADS_DIR}/${filename}`);
      await uploadsRepo.removeByFilename(filename);
    } catch {
      /* The ordinary upload sweeper retries orphan cleanup. */
    }
  }
  return result;
}

function cdata(value: string): string {
  return `<![CDATA[${value.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

function wordpress(posts: ContentArchivePost[], urls: string[], author: string, origin: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/"><channel>
<title>${escapeHtml(author)}</title><link>${escapeHtml(origin)}</link><description>Content export</description>
<wp:wxr_version>1.2</wp:wxr_version><wp:base_site_url>${escapeHtml(origin)}</wp:base_site_url><wp:base_blog_url>${escapeHtml(origin)}</wp:base_blog_url>
<wp:author><wp:author_id>1</wp:author_id><wp:author_login>${cdata(author)}</wp:author_login><wp:author_display_name>${cdata(author)}</wp:author_display_name></wp:author>
${posts
  .map(
    (post, i) => `<item><title>${escapeHtml(post.title ?? "")}</title><link>${escapeHtml(urls[i])}</link>
<guid isPermaLink="false">${escapeHtml(post.key)}</guid><pubDate>${new Date(post.createdAt).toUTCString()}</pubDate>
<dc:creator>${cdata(author)}</dc:creator><content:encoded>${cdata(post.contentHtml)}</content:encoded>
<wp:post_id>${i + 1}</wp:post_id><wp:post_type>post</wp:post_type>
<wp:status>${post.status === "published" && !post.protected ? "publish" : "draft"}</wp:status>
<wp:post_date>${post.createdAt.slice(0, 19).replace("T", " ")}</wp:post_date>
<wp:post_date_gmt>${post.createdAt.slice(0, 19).replace("T", " ")}</wp:post_date_gmt>
<wp:post_modified>${post.updatedAt.slice(0, 19).replace("T", " ")}</wp:post_modified>
<wp:post_modified_gmt>${post.updatedAt.slice(0, 19).replace("T", " ")}</wp:post_modified_gmt>
${post.tags.map((tag) => `<category domain="post_tag" nicename="${escapeHtml(tag)}">${cdata(tag)}</category>`).join("")}</item>`,
  )
  .join("\n")}
</channel></rss>`;
}

export async function exportContent(user: Pick<User, "id" | "username" | "isPrivate">): Promise<Uint8Array> {
  const rows = await portabilityRepo.listOwn(user.id, MAX_ARCHIVE_POSTS + 1);
  if (rows.length > MAX_ARCHIVE_POSTS)
    throw badRequest(
      "Exports currently support up to 1,000 posts. Contact your instance administrator for a larger backup.",
    );
  const origin = await getOrigin();
  const tags = await tagsRepo.tagsForPosts(rows.map((post) => post.id));
  const files: Record<string, Uint8Array> = Object.create(null);
  let total = 0;
  const add = (path: string, data: Uint8Array) => {
    if (data.length > 10 * 1024 * 1024 || total + data.length > MAX_EXPANDED_BYTES)
      throw badRequest("The export exceeds the archive size limit (100 MB total, 10 MB per file).");
    files[path] = data;
    total += data.length;
  };
  const posts: ContentArchivePost[] = [];
  const online: ContentArchivePost[] = [];
  const urls: string[] = [];
  for (const row of rows) {
    const replacements = new Map<string, string>();
    const sources = imageUrls(row);
    for (const src of sources) {
      let local = src;
      if (src.startsWith(`${origin}/`)) local = src.slice(origin.length);
      const filename = uploadFilenameFromUrl(local);
      if (!filename) continue;
      const path = `media/${filename}`;
      if (!files[path]) {
        let image: Uint8Array;
        try {
          image = await readFile(`${config.UPLOADS_DIR}/${filename}`);
        } catch {
          throw badRequest("An image referenced by your posts is missing from storage. The export was not created.");
        }
        add(path, image);
      }
      replacements.set(src, path);
    }
    const post: ContentArchivePost = {
      key: identity(origin, row),
      title: row.title,
      contentHtml: rewriteImages(row.contentHtml, replacements),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      tags: (tags.get(row.id) ?? []).map((tag) => tag.slug),
      language: row.language,
      summary: row.summary,
      coverUrl: row.coverUrl ? (replacements.get(row.coverUrl) ?? row.coverUrl) : null,
      coverCredit: row.coverCredit,
      aiAssisted: row.aiAssisted,
      protected: user.isPrivate,
    };
    posts.push(post);
    const onlineReplacements = new Map(
      sources
        .filter((src) => src.startsWith("/"))
        .map((src) => [src, src.startsWith("//") ? `https:${src}` : `${origin}${src}`]),
    );
    online.push({ ...post, contentHtml: rewriteImages(row.contentHtml, onlineReplacements) });
    const url = `${origin}/@${user.username}/${row.slug ?? row.id.slice(0, 8)}`;
    urls.push(url);
    const offline = rewriteImages(
      post.contentHtml,
      new Map([...replacements.values()].map((path) => [path, `../${path}`])),
    );
    add(
      `posts/${row.id}.html`,
      strToU8(
        `<!doctype html><html lang="${escapeHtml(row.language ?? "en")}"><head><meta charset="utf-8"><title>${escapeHtml(row.title ?? "Untitled")}</title><link rel="canonical" href="${escapeHtml(url)}"></head><body><article><h1>${escapeHtml(row.title ?? "Untitled")}</h1>${offline}</article></body></html>`,
      ),
    );
  }
  const manifest: ContentArchive = { format: "omicron", version: 1, exportedAt: new Date().toISOString(), posts };
  add("omicron.json", strToU8(JSON.stringify(manifest, null, 2)));
  add("wordpress.xml", strToU8(wordpress(online, urls, user.username, origin)));
  add(
    "README.txt",
    strToU8(
      "Omicron content export, version 1\n\nImport this ZIP into another Omicron instance using Settings > Content.\nomicron.json contains all your posts, drafts, dates, tags, and cover metadata.\nposts/ contains standalone HTML; media/ contains referenced local uploads.\nExternal images remain linked and are NOT included. Keep a separate copy of them.\nwordpress.xml is a WordPress WXR export; its image URLs point to the original instance. Keep the source online while a destination imports its images.\nMedium accepts published article URLs through its importer. Substack accepts supported website/feed URLs; neither is guaranteed to accept this ZIP directly.\nScheduled and restricted posts are restored as drafts. No credentials, followers, comments, subscribers, or payments are included.\nThis archive includes private drafts. Store it securely.\n",
    ),
  );
  const bytes = zipSync(files, { level: 6 });
  if (bytes.length > MAX_ARCHIVE_BYTES) throw badRequest("The compressed export exceeds 50 MB.");
  return bytes;
}
