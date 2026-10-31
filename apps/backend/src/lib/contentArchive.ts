// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from "node:crypto";
import { posix } from "node:path";
import { ContentArchive, type ContentArchivePost } from "@omicron/contract";
import { load } from "cheerio";
import { parse } from "csv-parse/sync";
import { Unzip, UnzipInflate } from "fflate";
import { normalizeCoverCredit, normalizeCoverUrl } from "@/lib/cover.ts";
import { badRequest } from "@/lib/http.ts";
import { normalizeLanguage } from "@/lib/languages.ts";
import { sanitizePostHtml } from "@/lib/sanitize.ts";
import { MAX_TAGS_PER_POST, normalizeTags } from "@/lib/tags.ts";
import { SUMMARY_LENGTH } from "@/lib/webhook.ts";

export const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
export const MAX_EXPANDED_BYTES = 100 * 1024 * 1024;
export const MAX_ARCHIVE_POSTS = 1000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 5000;

export type ImportPost = ContentArchivePost & { warnings: string[]; file: string };
export type ParsedArchive = {
  format: "omicron" | "medium" | "substack" | "wordpress" | "rss";
  posts: ImportPost[];
  files: Map<string, Uint8Array>;
  warnings: string[];
};

export function importKey(key: string): string {
  return /^portability:[a-f0-9]{64}$/.test(key) ? key : `portability:${createHash("sha256").update(key).digest("hex")}`;
}

function safePath(path: string): boolean {
  return (
    !!path && !path.startsWith("/") && !path.includes("\\") && !path.split("/").includes("..") && !path.includes("\0")
  );
}

// Decompress incrementally: both declared sizes and actual output are bounded.
export function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const names = new Set<string>();
  let total = 0;
  try {
    const unzip = new Unzip((file) => {
      if (!safePath(file.name) || names.has(file.name))
        throw badRequest("The archive contains unsafe or duplicate paths.");
      names.add(file.name);
      if (names.size > MAX_FILES) throw badRequest("The archive contains too many files.");
      if (file.originalSize !== undefined && file.originalSize > MAX_FILE_BYTES)
        throw badRequest("An archive file exceeds 10 MB.");
      let size = 0;
      const chunks: Uint8Array[] = [];
      file.ondata = (err, chunk, final) => {
        if (err) throw err;
        size += chunk.length;
        total += chunk.length;
        if (size > MAX_FILE_BYTES || total > MAX_EXPANDED_BYTES)
          throw badRequest("The expanded archive is too large (100 MB total, 10 MB per file).");
        chunks.push(chunk);
        if (final && !file.name.endsWith("/")) {
          const data = new Uint8Array(size);
          let offset = 0;
          for (const part of chunks) {
            data.set(part, offset);
            offset += part.length;
          }
          files.set(file.name, data);
        }
      };
      file.start();
    });
    unzip.register(UnzipInflate);
    for (let i = 0; i < bytes.length; i += 1024) unzip.push(bytes.subarray(i, i + 1024), i + 1024 >= bytes.length);
  } catch (err) {
    if (err instanceof Error && "status" in err) throw err;
    throw badRequest("The ZIP archive is invalid or uses unsupported compression.");
  }
  return files;
}

function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function date(raw: string | null | undefined, warnings: string[]): string {
  const parsed = raw ? new Date(raw) : null;
  if (!parsed || !Number.isFinite(parsed.getTime())) {
    warnings.push("No valid date was found; the import date will be used.");
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

function entry(input: Partial<ContentArchivePost> & { key: string; contentHtml: string }, file: string): ImportPost {
  const warnings: string[] = [];
  return {
    key: input.key,
    title: input.title ?? null,
    contentHtml: input.contentHtml,
    status: input.status ?? "draft",
    createdAt: date(input.createdAt, warnings),
    updatedAt: date(input.updatedAt ?? input.createdAt, []),
    tags: input.tags ?? [],
    language: input.language ?? null,
    summary: input.summary ?? null,
    coverUrl: input.coverUrl ?? null,
    coverCredit: input.coverCredit ?? null,
    aiAssisted: input.aiAssisted ?? false,
    protected: input.protected ?? false,
    warnings,
    file,
  };
}

function medium(files: Map<string, Uint8Array>): ImportPost[] {
  const posts: ImportPost[] = [];
  for (const [file, bytes] of files) {
    if (!/(?:^|\/)posts\/[^/]+\.html?$/i.test(file)) continue;
    const $ = load(text(bytes));
    const body = $(".e-content").first();
    if (!body.length) continue;
    const url = $("a.u-url").attr("href") ?? $('link[rel="canonical"]').attr("href");
    const published = $(".dt-published").attr("datetime");
    posts.push(
      entry(
        {
          key: url || `medium:${posix.basename(file)}`,
          title: $(".p-name").first().text().trim() || $("h1").first().text().trim() || null,
          contentHtml: body.html() ?? "",
          createdAt: published,
          status: published && !/draft/i.test(posix.basename(file)) ? "published" : "draft",
          // Medium exports do not reliably identify member-only stories.
          protected: true,
          tags: $(".p-category")
            .map((_, el) => $(el).text())
            .get(),
        },
        file,
      ),
    );
  }
  return posts;
}

function substack(files: Map<string, Uint8Array>, csv: string): ImportPost[] {
  let rows: Record<string, string>[];
  try {
    rows = parse(text(files.get(csv)!), {
      columns: true,
      bom: true,
      skip_empty_lines: true,
      max_record_size: MAX_FILE_BYTES,
    });
  } catch {
    throw badRequest("Substack's posts.csv could not be read.");
  }
  if (rows.length > MAX_ARCHIVE_POSTS) throw badRequest("Import at most 1,000 posts at a time.");
  return rows.map((row) => {
    const id = row.post_id;
    if (!id || !/^[\w.-]+$/.test(id) || id.includes(".."))
      throw badRequest("Substack's posts.csv contains an invalid post_id.");
    const file = posix.join(posix.dirname(csv), "posts", `${id}.html`);
    const bytes = files.get(file);
    if (!bytes) throw badRequest(`The Substack archive is missing posts/${id}.html.`);
    return entry(
      {
        key: `substack:${id}`,
        title: row.title || null,
        contentHtml: text(bytes),
        status: row.is_published === "true" ? "published" : "draft",
        createdAt: row.post_date,
        summary: row.subtitle || null,
        protected: row.audience !== "everyone",
      },
      file,
    );
  });
}

function xml(bytes: Uint8Array): ParsedArchive {
  const $ = load(text(bytes), { xml: true });
  const wordpress = $("channel").children("wp\\:wxr_version").length > 0;
  if (!$("rss > channel").length) throw badRequest("Choose an RSS feed or WordPress WXR export.");
  const posts: ImportPost[] = [];
  $("channel > item").each((_, el) => {
    const item = $(el);
    const value = (name: string) => item.children(name.replaceAll(":", "\\:")).first().text();
    if (wordpress && value("wp:post_type") !== "post") return;
    const contentHtml = value("content:encoded") || value("description");
    posts.push(
      entry(
        {
          key: value("guid") || value("link") || `rss:${importKey(value("title") + contentHtml)}`,
          title: value("title") || null,
          contentHtml,
          createdAt: value("pubDate") || `${value("wp:post_date_gmt").replace(" ", "T")}Z`,
          status: wordpress ? (value("wp:status") === "publish" ? "published" : "draft") : "published",
          protected: !!value("wp:post_password"),
          tags: item
            .children("category")
            .map((_index, tag) => $(tag).text())
            .get(),
        },
        "feed.xml",
      ),
    );
  });
  return { format: wordpress ? "wordpress" : "rss", posts, files: new Map(), warnings: [] };
}

export function parseArchive(bytes: Uint8Array): ParsedArchive {
  if (!bytes.length || bytes.length > MAX_ARCHIVE_BYTES) throw badRequest("Choose an archive up to 50 MB.");
  let archive: ParsedArchive;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const files = readZip(bytes);
    const manifests = [...files.keys()].filter((f) => /(?:^|\/)omicron\.json$/.test(f));
    const csvs = [...files.keys()].filter((f) => /(?:^|\/)posts\.csv$/.test(f));
    if (manifests.length > 1 || csvs.length > 1) throw badRequest("The archive contains conflicting manifests.");
    if (manifests[0]) {
      let decoded: unknown;
      try {
        decoded = JSON.parse(text(files.get(manifests[0])!));
      } catch {
        throw badRequest("The Omicron manifest is invalid JSON.");
      }
      const result = ContentArchive.safeParse(decoded);
      if (!result.success) throw badRequest("The Omicron archive format or version is not supported.");
      archive = { format: "omicron", posts: result.data.posts.map((p) => entry(p, manifests[0])), files, warnings: [] };
    } else if (csvs[0]) {
      archive = { format: "substack", posts: substack(files, csvs[0]), files, warnings: [] };
    } else {
      archive = { format: "medium", posts: medium(files), files, warnings: [] };
    }
  } else archive = xml(bytes);
  if (!archive.posts.length) throw badRequest("No supported posts were found in this export.");
  if (archive.posts.length > MAX_ARCHIVE_POSTS) throw badRequest("Import at most 1,000 posts at a time.");
  const keys = new Set<string>();
  for (const post of archive.posts) {
    if (!post.key || post.key.length > 4096) throw badRequest("An imported post has an invalid identity.");
    post.key = importKey(post.key);
    if (keys.has(post.key)) throw badRequest("The archive contains duplicate post identities.");
    keys.add(post.key);
    post.title = post.title?.trim() || null;
    if ((post.title?.length ?? 0) > 1000 || post.contentHtml.length > 1_000_000)
      throw badRequest("An imported post is too large.");
    post.contentHtml = sanitizePostHtml(post.contentHtml).trim();
    post.contentHtml = rewriteImages(
      post.contentHtml,
      new Map(
        imageUrls(post)
          .filter((url) => url.startsWith("//"))
          .map((url) => [url, `https:${url}`]),
      ),
    );
    if (!post.contentHtml) throw badRequest(`A post has no supported content: ${post.title ?? "Untitled"}.`);
    const tags = normalizeTags(post.tags);
    if (tags.length > MAX_TAGS_PER_POST) post.warnings.push("Only the first five tags will be imported.");
    post.tags = tags.slice(0, MAX_TAGS_PER_POST);
    post.language = normalizeLanguage(post.language);
    if ((post.summary?.length ?? 0) > SUMMARY_LENGTH)
      post.warnings.push("The description will be shortened to 150 characters.");
    post.summary = post.summary?.replace(/\s+/g, " ").trim().slice(0, SUMMARY_LENGTH) || null;
    post.coverUrl = post.coverUrl?.startsWith("media/") ? post.coverUrl : normalizeCoverUrl(post.coverUrl);
    post.coverCredit = post.coverUrl ? normalizeCoverCredit(post.coverCredit) : null;
    if (post.status === "scheduled")
      post.warnings.push("Scheduled posts are imported as drafts; schedules are not activated.");
    if (post.protected)
      post.warnings.push("Restricted content will remain a draft, even when preserving published status.");
  }
  archive.warnings.push(
    "Imports skip duplicates and never overwrite existing posts. Comments, followers, subscribers, and payments are not transferred.",
  );
  if (archive.format === "medium")
    archive.warnings.push(
      "Medium exports do not reliably record access restrictions. All Medium posts are imported as drafts for review.",
    );
  return archive;
}

/** Resolve only bundled files; never fetch an archive-supplied URL. */
export function bundledImage(archive: ParsedArchive, post: ImportPost, url: string): string | null {
  if (/^(?:https?:)?\/\//i.test(url)) return null;
  const path = posix.normalize(posix.join(posix.dirname(post.file), url));
  return safePath(path) && archive.files.has(path) ? path : null;
}

export function imageUrls(post: Pick<ContentArchivePost, "contentHtml" | "coverUrl">): string[] {
  const $ = load(post.contentHtml, {}, false);
  return [
    ...new Set(
      [
        $("img")
          .map((_, el) => $(el).attr("src") ?? "")
          .get(),
        post.coverUrl ?? "",
      ]
        .flat()
        .filter(Boolean),
    ),
  ];
}

export function rewriteImages(html: string, replacements: Map<string, string>): string {
  if (!replacements.size) return html;
  const $ = load(html, {}, false);
  $("img").each((_, el) => {
    const src = $(el).attr("src");
    if (src && replacements.has(src)) $(el).attr("src", replacements.get(src));
  });
  return $.root().html() ?? "";
}
