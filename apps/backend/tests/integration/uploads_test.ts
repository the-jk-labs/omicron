import { eq } from "drizzle-orm";
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Upload quotas and garbage collection, against a real database, real SQL and
// a real filesystem.
//
// Three things here cannot be checked any other way. The quota's atomicity
// lives in one Postgres transaction whose locks — an advisory lock and the
// owner's row lock — only exist under a live server. The reference scan is SQL
// whose regex grammar has to agree with the app's own lib/uploads.ts grammar,
// and a divergence would reap live files. And the sweeper's grace period only
// means something against real rows and real files on disk: refresh-then-reap
// is exactly the sequence a unit test would have to mock away.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { config } from "@/config.ts";
import { db } from "@/db/client.ts";
import * as uploadsRepo from "@/db/repositories/uploads.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { posts, uploads } from "@/db/schema.ts";
import { saveImage } from "@/services/media.ts";
import { sweep } from "@/services/uploadGc.ts";
import { closeDb, mkPost, mkUser, resetDb } from "./harness.ts";

const DAY = 24 * 3_600_000;

// A buffer whose leading bytes are a real PNG signature, padded to `size` —
// enough to pass saveImage's magic-byte check, which is the only thing between
// the test and the disk beyond the quota itself.
function pngBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

function filenameOf(url: string): string {
  return url.replace("/api/uploads/", "");
}

async function existsOnDisk(filename: string): Promise<boolean> {
  try {
    await Deno.stat(`${config.UPLOADS_DIR}/${filename}`);
    return true;
  } catch {
    return false;
  }
}

// Backdates a row past the default 30-day grace period, the way a row the
// sweeper stopped seeing referenced weeks ago would look.
function ageOut(filename: string) {
  return db
    .update(uploads)
    .set({ lastReferencedAt: new Date(Date.now() - 40 * DAY) })
    .where(eq(uploads.filename, filename));
}

async function storedFilenames(): Promise<string[]> {
  return (await db.select({ filename: uploads.filename }).from(uploads)).map((r) => r.filename);
}

afterAll(async () => {
  await closeDb();
});

describe("createWithinQuota", () => {
  // Per-test reset: these tests assert exact storage state, and quota sums are
  // global — a leftover row from a sibling test would consume the cap.
  beforeEach(resetDb);

  test("an upload that fits is recorded with its owner and size", async () => {
    const user = await mkUser("quota-ok");
    expect(await uploadsRepo.createWithinQuota(user.id, "fit.png", 100, 200, 10_000_000)).toEqual({ ok: true });
    const [row] = await db.select().from(uploads).where(eq(uploads.filename, "fit.png"));
    expect(row.ownerId).toBe(user.id);
    expect(row.bytes).toBe(100);
  });

  test("the per-user cap rejects once the account is full", async () => {
    const user = await mkUser("quota-user");
    expect((await uploadsRepo.createWithinQuota(user.id, "u-1.png", 100, 150, 0)).ok).toBe(true);
    // The refusal comes back as a verdict rather than a throw, so the caller
    // can turn it into the 413 that names the breached cap.
    expect(await uploadsRepo.createWithinQuota(user.id, "u-2.png", 100, 150, 0)).toEqual({
      ok: false,
      reason: "user",
    });
    // And the refused upload reserved nothing.
    expect(await storedFilenames()).toEqual(["u-1.png"]);
  });

  test("the global cap rejects when only it breaches", async () => {
    const full = await mkUser("quota-global-full");
    const other = await mkUser("quota-global-other");
    expect((await uploadsRepo.createWithinQuota(full.id, "g-1.png", 500, 0, 600)).ok).toBe(true);
    expect(await uploadsRepo.createWithinQuota(other.id, "g-2.png", 200, 0, 600)).toEqual({
      ok: false,
      reason: "total",
    });
  });

  test("a cap of 0 disables its check", async () => {
    const user = await mkUser("quota-off");
    expect((await uploadsRepo.createWithinQuota(user.id, "off.png", 10_000, 0, 0)).ok).toBe(true);
  });

  test("a vanished owner is refused rather than 500ing on the foreign key", async () => {
    expect(await uploadsRepo.createWithinQuota(crypto.randomUUID(), "ghost.png", 1, 100, 100)).toEqual({
      ok: false,
      reason: "user",
    });
  });
});

describe("the reference scan", () => {
  beforeAll(resetDb);

  test("avatars, covers and body images all count; absolute URLs and derivatives do not", async () => {
    const user = await mkUser("scanned");
    await db.insert(uploads).values({ ownerId: user.id, filename: "avatar.png", bytes: 1 });
    await db.insert(uploads).values({ ownerId: user.id, filename: "cover.png", bytes: 1 });
    await db.insert(uploads).values({ ownerId: user.id, filename: "body.png", bytes: 1 });
    await db.insert(uploads).values({ ownerId: user.id, filename: "unreferenced.png", bytes: 1 });

    await usersRepo.update(user.id, { avatarUrl: "/api/uploads/avatar.png" });
    const coverPost = await mkPost(user.id, "with-cover");
    await db.update(posts).set({ coverUrl: "/api/uploads/cover.png" }).where(eq(posts.id, coverPost.id));
    const bodyPost = await mkPost(user.id, "with-images");
    await db
      .update(posts)
      .set({
        contentHtml:
          '<p><img src="/api/uploads/body.png"></p><img src="/api/uploads/og/body.jpg"><img src="https://elsewhere.test/x.png">',
      })
      .where(eq(posts.id, bodyPost.id));

    const referenced = await uploadsRepo.referencedFilenames();
    // The body's second and third images must NOT appear: one is the derived
    // share image, the other is on someone else's host. Neither is a reference
    // to a stored file, and treating them as one would hide real orphans.
    expect(referenced.toSorted()).toEqual(["avatar.png", "body.png", "cover.png"]);
    expect(referenced).not.toContain("unreferenced.png");
  });
});

describe("the GC sweeper", () => {
  beforeAll(resetDb);

  test("referenced files survive and are refreshed; unreferenced ones past the grace are reaped", async () => {
    const user = await mkUser("gc");
    // One upload a post body still points at, one nobody references any more —
    // the avatar-replaced / post-deleted shape, aged past the grace period.
    const keptFile = filenameOf(await saveImage(user.id, pngBytes(1000), "image/png"));
    const post = await mkPost(user.id, "with-image");
    await db
      .update(posts)
      .set({ contentHtml: `<p><img src="/api/uploads/${keptFile}"></p>` })
      .where(eq(posts.id, post.id));
    const lostFile = filenameOf(await saveImage(user.id, pngBytes(1000), "image/png"));

    await ageOut(keptFile);
    await ageOut(lostFile);

    expect(await sweep()).toBe(1);
    expect(await existsOnDisk(keptFile)).toBe(true);
    expect(await existsOnDisk(lostFile)).toBe(false);
    expect(await storedFilenames()).toEqual([keptFile]);
    // The same sweep that spared the survivor also refreshed it — the thing
    // that keeps a file referenced at any recent sweep safe for a full grace
    // period after its last reference disappears.
    const [kept] = await db.select().from(uploads).where(eq(uploads.filename, keptFile));
    expect(kept.lastReferencedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  test("a second sweep finds nothing more to do", async () => {
    expect(await sweep()).toBe(0);
  });

  test("a row whose file is already gone reaps cleanly instead of wedging the sweep", async () => {
    const user = await mkUser("gc-ghost");
    await db.insert(uploads).values({ ownerId: user.id, filename: "ghost.png", bytes: 5 });
    await ageOut("ghost.png");
    expect(await sweep()).toBe(1);
    // Earlier tests' referenced rows legitimately survive; the point is that
    // the file-less row is gone and the sweep did not wedge.
    expect(await storedFilenames()).not.toContain("ghost.png");
  });
});
