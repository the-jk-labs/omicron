// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq, inArray, like, lt, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { posts, uploads, users } from "@/db/schema.ts";
import { quotaVerdict } from "@/lib/uploads.ts";

// Upload-record DB access. Services never touch `db` directly. One row per
// accepted media upload, mirroring the file on disk (see db/schema.ts for why
// the row and the file are deliberately decoupled).

export type QuotaResult = { ok: true } | { ok: false; reason: "user" | "total" };

async function create(ownerId: string, filename: string, bytes: number) {
  await db.insert(uploads).values({ ownerId, filename, bytes });
}

// Records an upload and enforces the storage quotas in one transaction, so a
// cap cannot be raced past by two uploads landing together. The sums are
// computed rather than kept as counters: slower on huge tables, but immune to
// drift when rows leave outside this path (GC reaps, account deletion
// cascades) — a quota that silently over-counts locks users out forever, and
// that failure mode is far worse than the scan. Locking (advisory lock for the
// global sum, the owner row for the per-user sum) is what makes check + insert
// atomic; uploads are rare relative to reads, so the coarse global lock costs
// nothing. A cap of 0 disables its check entirely.
export async function createWithinQuota(
  ownerId: string,
  filename: string,
  bytes: number,
  maxUserBytes: number,
  maxTotalBytes: number,
): Promise<QuotaResult> {
  if (maxUserBytes <= 0 && maxTotalBytes <= 0) {
    await create(ownerId, filename, bytes);
    return { ok: true };
  }
  return await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(745220011)`);
    // Locking the owner's row serializes that user's uploads and tells us
    // whether they still exist — a vanished owner must not reserve storage.
    const owner = await tx.select({ id: users.id }).from(users).where(eq(users.id, ownerId)).for("update");
    if (owner.length === 0) return { ok: false, reason: "user" };
    const [userSum, totalSum] = await Promise.all([
      tx
        .select({ total: sql<number>`coalesce(sum(${uploads.bytes}), 0)::double precision` })
        .from(uploads)
        .where(eq(uploads.ownerId, ownerId)),
      tx.select({ total: sql<number>`coalesce(sum(${uploads.bytes}), 0)::double precision` }).from(uploads),
    ]);
    const verdict = quotaVerdict(userSum[0]?.total ?? 0, bytes, totalSum[0]?.total ?? 0, maxUserBytes, maxTotalBytes);
    if (verdict !== "ok") return { ok: false, reason: verdict };
    await tx.insert(uploads).values({ ownerId, filename, bytes });
    return { ok: true };
  });
}

// Total bytes a user has uploaded. Read-only today (abuse inspection), and the
// natural hook for per-user quotas if those land later.
export async function sumBytesForUser(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${uploads.bytes}), 0)::double precision` })
    .from(uploads)
    .where(eq(uploads.ownerId, userId));
  return row?.total ?? 0;
}

// Forgets a reserved upload whose file never made it to disk (see
// services/media.ts, which compensates when the disk write fails).
export async function removeByFilename(filename: string) {
  await db.delete(uploads).where(eq(uploads.filename, filename));
}

// ── reference scan + garbage collection ───────────────────────────────

// The SQL twin of lib/uploads.ts's filename grammar — keep the two in sync.
// Emitted via sql.raw because the special `substring(x from '…')` syntax wants
// its pattern as static query text, not a bind parameter. Constant we control,
// so raw interpolation is safe.
const UPLOAD_RE_SQL = sql.raw(`'/api/uploads/([a-zA-Z0-9-]+\\.(?:png|jpe?g|webp|gif))'`);

// Every upload filename currently referenced anywhere persistent. This is the
// single source of truth for what the GC must never reap: a new column or
// table that stores an /api/uploads/… URL MUST be added here, or the sweep
// will eventually delete a file still in use. Comment bodies are deliberately
// not scanned — they render escaped, never as HTML, so they cannot embed
// images. Body images are extracted SQL-side (`regexp_matches … 'g'` finds
// every occurrence, not just the first) so post HTML never ships to the app.
export async function referencedFilenames(): Promise<string[]> {
  const [avatarRows, coverRows, bodyRows] = await Promise.all([
    db
      .selectDistinct({ filename: sql<string | null>`substring(${users.avatarUrl} from ${UPLOAD_RE_SQL})` })
      .from(users)
      .where(like(users.avatarUrl, "/api/uploads/%")),
    db
      .selectDistinct({ filename: sql<string | null>`substring(${posts.coverUrl} from ${UPLOAD_RE_SQL})` })
      .from(posts)
      .where(like(posts.coverUrl, "/api/uploads/%")),
    db
      .selectDistinct({
        filename: sql<string | null>`(regexp_matches(${posts.contentHtml}, ${UPLOAD_RE_SQL}, 'g'))[1]`,
      })
      .from(posts)
      .where(like(posts.contentHtml, "%/api/uploads/%")),
  ]);
  const filenames = new Set<string>();
  for (const row of [...avatarRows, ...coverRows, ...bodyRows]) {
    if (row.filename) filenames.add(row.filename);
  }
  return [...filenames];
}

// Stamps every referenced file as referenced-now. The reap step keys its grace
// period on this column, so a file referenced at any recent sweep is safe even
// if its last local reference is removed moments later.
export async function refreshReferenced(filenames: string[]) {
  if (filenames.length === 0) return;
  await db.update(uploads).set({ lastReferencedAt: new Date() }).where(inArray(uploads.filename, filenames));
}

// Rows unreferenced for longer than `cutoff` — safe to reap.
export function listReapable(cutoff: Date, limit: number): Promise<{ id: string; filename: string }[]> {
  return db
    .select({ id: uploads.id, filename: uploads.filename })
    .from(uploads)
    .where(lt(uploads.lastReferencedAt, cutoff))
    .limit(limit);
}

// Forgets a reaped upload. The caller has already unlinked the file (or found
// it already gone).
export async function remove(id: string) {
  await db.delete(uploads).where(eq(uploads.id, id));
}
