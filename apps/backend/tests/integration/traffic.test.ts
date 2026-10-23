// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from "node:crypto";
import { afterAll, beforeEach, expect, test } from "vitest";
import { db, sql } from "@/db/client.ts";
import * as repo from "@/db/repositories/traffic.ts";
import { trafficBuckets } from "@/db/schema.ts";
import { cardinality, mergeInto, registerOf, REGISTERS } from "@/lib/cardinality.ts";
import { isoDay, trafficRange } from "@/lib/traffic.ts";
import { trafficRoutes } from "@/routes/traffic.ts";
import { getOrigin } from "@/services/instanceSetup.ts";
import { setTrafficEnabled } from "@/services/settings.ts";
import { summary } from "@/services/traffic.ts";
import { mount } from "../routes/harness.ts";
import { closeDb, mkList, mkPost, mkRemoteActor, mkRemotePost, mkUser, resetDb } from "./harness.ts";

const register = (value: string) => registerOf(createHash("sha256").update(value).digest());
beforeEach(async () => {
  await resetDb();
  await sql`truncate traffic_buckets, instance_settings`;
});
afterAll(closeDb);

test("browser collection, cookies, database aggregates and reporting work together", async () => {
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
  const cookie = first.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  expect(cookie).toContain("omicron_traffic_visitor=");
  await send("/about?token=discarded", { cookie });
  const range = trafficRange(isoDay(), isoDay());
  expect((await summary(range)).totals).toEqual({ pageviews: 2, visitors: 1, visits: 1 });
  await send("/contact", { cookie, dnt: "1" });
  await send("/privacy", { cookie, "sec-gpc": "1" });
  expect((await summary(range)).totals.pageviews).toBe(2);
  const visitorOnly = cookie.split("; ").find((value) => value.startsWith("omicron_traffic_visitor="))!;
  await send("/contact", { cookie: visitorOnly });
  const result = await summary(range);
  expect(result.totals).toEqual({ pageviews: 3, visitors: 1, visits: 2 });
  expect(result.breakdowns.path).toContainEqual({ value: "/about", pageviews: 1 });
  await setTrafficEnabled(false);
  expect((await send("/status", { cookie })).headers.getSetCookie()).toEqual([]);
  expect((await summary(range)).totals.pageviews).toBe(3);
});

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
