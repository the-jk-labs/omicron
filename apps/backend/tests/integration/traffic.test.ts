// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFile } from "node:fs/promises";
import { afterAll, beforeEach, expect, test } from "vitest";
import { db, sql } from "@/db/client.ts";
import * as repo from "@/db/repositories/traffic.ts";
import { trafficBuckets } from "@/db/schema.ts";
import { isoDay, trafficRange } from "@/lib/traffic.ts";
import { trafficRoutes } from "@/routes/traffic.ts";
import { getOrigin } from "@/services/instanceSetup.ts";
import { setTrafficEnabled } from "@/services/settings.ts";
import { summary } from "@/services/traffic.ts";
import { mount } from "../routes/harness.ts";
import { closeDb, mkList, mkPost, mkRemoteActor, mkRemotePost, mkUser, resetDb } from "./harness.ts";

beforeEach(async () => {
  await resetDb();
  await sql`truncate traffic_buckets, instance_settings`;
});
afterAll(closeDb);

test("the cookieless migration removes sketches while preserving existing pageviews", async () => {
  const original = await readFile(new URL("../../drizzle/0044_daily_gateway.sql", import.meta.url), "utf8");
  const migration = await readFile(new URL("../../drizzle/0045_cookieless_traffic.sql", import.meta.url), "utf8");
  const rollback = new Error("Roll back the isolated migration fixture.");
  await expect(
    sql.begin(async (tx) => {
      await tx`create schema traffic_privacy_migration`;
      await tx`set local search_path to traffic_privacy_migration`;
      await tx.unsafe(original);
      await tx`insert into traffic_buckets (day, dimension, value, pageviews, visitors, visits)
      values ('2026-01-01', 'total', '', 7, decode(repeat('00', 4096), 'hex'), decode(repeat('00', 4096), 'hex'))`;
      for (const statement of migration.split("--> statement-breakpoint")) await tx.unsafe(statement);
      const rows = await tx`select day::text, dimension, value, pageviews::int from traffic_buckets`;
      expect([...rows]).toEqual([{ day: "2026-01-01", dimension: "total", value: "", pageviews: 7 }]);
      const columns = await tx`select column_name from information_schema.columns
      where table_schema = 'traffic_privacy_migration' and table_name = 'traffic_buckets' order by ordinal_position`;
      expect(columns.map((row) => row.column_name)).toEqual(["day", "dimension", "value", "pageviews"]);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});

test("cookieless collection, privacy gates, database aggregates and reporting work together", async () => {
  const api = mount("/api/traffic", trafficRoutes);
  const headers = {
    origin: await getOrigin(),
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
  };
  const send = (path: string, extra: Record<string, string> = {}) =>
    api.json("/api/traffic/pageview", "POST", { path }, { ...headers, ...extra });
  expect((await send("/")).headers.getSetCookie()).toEqual([]);
  expect(await repo.firstDay()).toBeNull();
  await setTrafficEnabled(true);
  const first = await send("/");
  expect(first.status).toBe(204);
  expect(first.headers.getSetCookie()).toEqual([]);
  const cookie = "omicron_traffic_visitor=legacy-secret; omicron_traffic_visit=legacy-secret";
  expect((await send("/about?token=discarded", { cookie })).headers.getSetCookie()).toEqual([]);
  const range = trafficRange(isoDay(), isoDay());
  expect((await summary(range)).totals).toEqual({ pageviews: 2 });
  await send("/contact", { cookie, dnt: "1" });
  await send("/privacy", { cookie, "sec-gpc": "1" });
  expect((await summary(range)).totals.pageviews).toBe(2);
  await send("/about?token=discarded");
  const result = await summary(range);
  expect(result.totals).toEqual({ pageviews: 3 });
  expect(result.breakdowns.path).toContainEqual({ value: "/about", pageviews: 2 });
  const stored = await db.select().from(trafficBuckets);
  expect(stored.every((row) => Object.keys(row).toSorted().join(",") === "day,dimension,pageviews,value")).toBe(true);
  expect(JSON.stringify(stored)).not.toMatch(/legacy-secret|discarded|Mozilla/);
  await setTrafficEnabled(false);
  expect((await send("/status", { cookie })).headers.getSetCookie()).toEqual([]);
  expect((await summary(range)).totals.pageviews).toBe(3);
});

test("concurrent and repeated loads count independently without losing pageviews", async () => {
  await Promise.all(Array.from({ length: 12 }, () => repo.record("2026-01-01", [{ dimension: "path", value: "/" }])));
  await repo.record("2026-01-02", [{ dimension: "path", value: "/about" }]);
  const rows = await repo.dailyTotals("2026-01-01", "2026-01-02");
  expect(rows.map((r) => r.pageviews)).toEqual([12, 1]);
  expect(rows).toEqual([
    { day: "2026-01-01", pageviews: 12 },
    { day: "2026-01-02", pageviews: 1 },
  ]);
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
    ["/new-a", "/new-b", "/page-1"].map((value) => repo.record("2026-01-01", [{ dimension: "path", value }])),
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
  await repo.record("2026-01-01", [{ dimension: "path", value: "/" }]);
  await repo.record("2026-01-02", [{ dimension: "path", value: "/" }]);
  await repo.prune("2026-01-02");
  expect(await repo.firstDay()).toBe("2026-01-02");
  expect(await repo.dailyTotals("2026-01-01", "2026-01-02")).toHaveLength(1);
});

test("public reading lists and cached federated pages are measured, without remote lookups", async () => {
  const owner = await mkUser("alice");
  const publicList = await mkList(owner.id, "Reading", "public");
  const privateList = await mkList(owner.id, "Private", "private");
  expect(await repo.publicContentPath(`/lists/reading-${publicList.id.slice(0, 8)}`)).toBe(true);
  expect(await repo.publicContentPath(`/lists/private-${privateList.id.slice(0, 8)}`)).toBe(false);
  const actor = await mkRemoteActor("bob@remote.test");
  const post = await mkRemotePost(actor.id, "https://remote.test/posts/one");
  expect(await repo.publicContentPath("/@bob@remote.test")).toBe(true);
  expect(await repo.publicContentPath(`/@bob@remote.test/${post.id.slice(0, 8)}`)).toBe(true);
  expect(await repo.publicContentPath("/@bob@remote.test/not-a-post")).toBe(false);
  expect(await repo.publicContentPath("/@missing@remote.test")).toBe(false);
});
