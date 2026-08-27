// SPDX-License-Identifier: AGPL-3.0-or-later
import { config } from "@/config.ts";
import * as instanceSettingsRepo from "@/db/repositories/instanceSettings.ts";
import * as uploadsRepo from "@/db/repositories/uploads.ts";
import { uploadFilenameFromUrl } from "@/lib/uploads.ts";
import { SETUP_KEYS } from "@/services/instanceSetup.ts";
import { cachePath } from "@/services/shareImage.ts";

// Delayed garbage collection for uploaded media.
//
// Files on disk outlive every reference that ever pointed at them: replacing
// an avatar orphans the old file, deleting a post orphans its body images, and
// deleting a user cascades their upload rows while the files stay behind (see
// db/schema.ts `uploads` for why that decoupling is deliberate). This sweeper
// reaps the orphans — but only after a full grace period, because federated
// instances cache these URLs and keep fetching them long after the local
// reference is gone. A file is deleted only once a sweep has seen nothing
// referencing it for UPLOAD_GC_GRACE_DAYS straight.
//
// Database-backed and timer-driven like the scheduled-post sweeper
// (services/scheduledPosts.ts): the job queue is one-shot and, without Redis,
// not durable, while GC must simply happen every day forever. The sweep is
// idempotent — deleting an already-deleted file is a no-op — so it is safe to
// run on every backend process without coordination.

// Daily. The grace period absorbs sweep latency, so a tighter loop would buy
// nothing for a scan that touches every post's HTML.
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Most a single sweep will delete. A cap only matters after the GC first
// lands on an instance with years of orphans; the rest follow on later sweeps
// rather than one pass unlinking thousands of files.
const REAP_BATCH = 200;

let started = false;

/** Start the GC sweeper. Call once at boot. */
export function startUploadGcSweeper(): void {
  if (started) return;
  started = true;
  void sweep();
  setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
  console.log("✔ Upload GC sweeper started.");
}

/**
 * One pass: refresh what is referenced, then reap what has been unreferenced
 * past the grace period. Returns the number of files deleted. Failures are
 * logged and dropped — every step is retried wholesale by the next sweep, so
 * there is no retry ladder to maintain.
 */
export async function sweep(): Promise<number> {
  let referenced: string[];
  try {
    referenced = await collectReferenced();
  } catch (err) {
    console.error("upload-gc: reference scan failed:", err);
    return 0;
  }
  try {
    await uploadsRepo.refreshReferenced(referenced);
  } catch (err) {
    console.error("upload-gc: failed to refresh references:", err);
    return 0;
  }

  const cutoff = new Date(Date.now() - config.UPLOAD_GC_GRACE_DAYS * 86_400_000);
  let victims: { id: string; filename: string }[];
  try {
    victims = await uploadsRepo.listReapable(cutoff, REAP_BATCH);
  } catch (err) {
    console.error("upload-gc: failed to list reapable uploads:", err);
    return 0;
  }

  let reaped = 0;
  for (const victim of victims) {
    try {
      await Deno.remove(`${config.UPLOADS_DIR}/${victim.filename}`);
    } catch (err) {
      // Already gone — another node won the race, or an earlier sweep unlinked
      // the file but failed before forgetting the row: the row can still go.
      // Anything else leaves the row so a later sweep retries.
      if (!(err instanceof Deno.errors.NotFound)) {
        console.warn(`upload-gc: could not delete ${victim.filename}:`, err);
        continue;
      }
    }
    // Drop the derived share image too (id = filename without extension);
    // stale otherwise, and it would never be rebuilt once the source is gone.
    const id = victim.filename.replace(/\.[a-z0-9]+$/i, "");
    await Deno.remove(cachePath(id)).catch(() => {});
    try {
      await uploadsRepo.remove(victim.id);
    } catch (err) {
      console.warn(`upload-gc: could not forget ${victim.filename}:`, err);
      continue;
    }
    reaped++;
  }
  if (reaped > 0) console.log(`upload-gc: reaped ${reaped} unreferenced upload(s).`);
  return reaped;
}

// Everything that currently points at an upload: the persistent reference scan
// (profile avatars, post covers and body images) plus the instance banner,
// which lives in the settings key/value store rather than a column.
async function collectReferenced(): Promise<string[]> {
  const [fromContent, bannerUrl] = await Promise.all([
    uploadsRepo.referencedFilenames(),
    instanceSettingsRepo.get<string>(SETUP_KEYS.bannerImageUrl),
  ]);
  const filenames = new Set(fromContent);
  const banner = uploadFilenameFromUrl(bannerUrl);
  if (banner) filenames.add(banner);
  return [...filenames];
}
