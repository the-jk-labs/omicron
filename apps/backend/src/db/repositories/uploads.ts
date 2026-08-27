// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq, inArray, like, lt, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { posts, uploads, users } from "@/db/schema.ts";

// Upload-record DB access. Services never touch `db` directly. One row per
// accepted media upload, mirroring the file on disk (see db/schema.ts for why
// the row and the file are deliberately decoupled).

export async function create(ownerId: string, filename: string, bytes: number) {
  await db.insert(uploads).values({ ownerId, filename, bytes });
}

// Total bytes a user has uploaded. Read-only today (abuse inspection), and the
// natural hook for per-user quotas if those land later.
export async function sumBytesForUser(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${uploads.bytes}), 0)::bigint` })
    .from(uploads)
    .where(eq(uploads.ownerId, userId));
  return row?.total ?? 0;
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
