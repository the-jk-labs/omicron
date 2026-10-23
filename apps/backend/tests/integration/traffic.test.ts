// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from "node:crypto";
import { afterAll, beforeEach, expect, test } from "vitest";
import { db, sql } from "@/db/client.ts";
import * as repo from "@/db/repositories/traffic.ts";
import { trafficBuckets } from "@/db/schema.ts";
import { cardinality, mergeInto, registerOf, REGISTERS } from "@/lib/cardinality.ts";
import { closeDb, mkPost, mkUser, resetDb } from "./harness.ts";

const register = (value: string) => registerOf(createHash("sha256").update(value).digest());
beforeEach(async () => {
  await resetDb();
  await sql`truncate traffic_buckets`;
});
afterAll(closeDb);

test("concurrent hits never lose increments, and returning visitors merge across days", async () => {
  await Promise.all(
    Array.from({ length: 12 }, () =>
      repo.record("2026-01-01", register("visitor"), register("visit"), [{ dimension: "path", value: "/" }]),
    ),
  );
  await repo.record("2026-01-02", register("visitor"), register("visit-2"), [{ dimension: "path", value: "/about" }]);
  const rows = await repo.dailyTotals("2026-01-01", "2026-01-02");
  expect(rows.map((r) => r.pageviews)).toEqual([12, 1]);
  const visitors = new Uint8Array(REGISTERS);
  const visits = new Uint8Array(REGISTERS);
  for (const row of rows) {
    mergeInto(visitors, row.visitors!);
    mergeInto(visits, row.visits!);
  }
  expect(cardinality(visitors)).toBe(1);
  expect(cardinality(visits)).toBe(2);
  expect(await repo.breakdowns("2026-01-01", "2026-01-02")).toContainEqual({
    dimension: "path",
    value: "/",
    pageviews: 12,
  });
});

test("new high-cardinality values are capped atomically without dropping total pageviews", async () => {
  await db.insert(trafficBuckets).values(
    Array.from({ length: repo.MAX_DIMENSION_VALUES }, (_, i) => ({
      day: "2026-01-01",
      dimension: "path" as const,
      value: `/page-${i}`,
      pageviews: 1,
    })),
  );
  await Promise.all(
    ["/new-a", "/new-b", "/page-1"].map((value) =>
      repo.record("2026-01-01", register("a"), register("b"), [{ dimension: "path", value }]),
    ),
  );
  const list = await repo.breakdowns("2026-01-01", "2026-01-01");
  expect(list).toHaveLength(repo.MAX_DIMENSION_VALUES + 1);
  expect(list).toContainEqual({ dimension: "path", value: repo.OTHER_VALUE, pageviews: 2 });
  expect(list).toContainEqual({ dimension: "path", value: "/page-1", pageviews: 2 });
  expect((await repo.dailyTotals("2026-01-01", "2026-01-01"))[0].pageviews).toBe(3);
});

test("private, withdrawn, unpublished and nonexistent posts are excluded", async () => {
  const alice = await mkUser("alice");
  const privateUser = await mkUser("private", { isPrivate: true });
  await mkPost(alice.id, "published");
  await mkPost(alice.id, "draft", { status: "draft" });
  await mkPost(privateUser.id, "secret");
  expect(await repo.publicContentPath("/@alice/published")).toBe(true);
  expect(await repo.publicContentPath("/@alice/draft")).toBe(false);
  expect(await repo.publicContentPath("/@private/secret")).toBe(false);
  expect(await repo.publicContentPath("/@nobody/missing")).toBe(false);
  const untitled = await mkPost(alice.id, "untitled");
  await sql`update posts set slug = null where id = ${untitled.id}`;
  expect(await repo.publicContentPath(`/@alice/${untitled.id.slice(0, 8)}`)).toBe(true);
});

test("retention removes only buckets older than the inclusive cutoff", async () => {
  await repo.record("2026-01-01", register("a"), register("b"), [{ dimension: "path", value: "/" }]);
  await repo.record("2026-01-02", register("a"), register("b"), [{ dimension: "path", value: "/" }]);
  await repo.prune("2026-01-02");
  expect(await repo.firstDay()).toBe("2026-01-02");
  expect(await repo.dailyTotals("2026-01-01", "2026-01-02")).toHaveLength(1);
});
