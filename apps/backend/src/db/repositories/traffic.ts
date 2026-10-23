// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, eq, gte, lte, lt, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { trafficBuckets, type TrafficDimension, posts, users, remoteActors, readingLists } from "@/db/schema.ts";
import { REGISTERS, type Register } from "@/lib/cardinality.ts";

export const MAX_DIMENSION_VALUES = 500;
export const OTHER_VALUE = "Other (daily limit)";
export type TrafficBreakdown = { dimension: Exclude<TrafficDimension, "total">; value: string; pageviews: number };

export async function publicContentPath(path: string): Promise<boolean> {
  const list = /^\/lists\/(?:[a-z0-9-]+-)?([a-f0-9]{8})$/i.exec(path);
  if (list) {
    const [row] = await db
      .select({ id: readingLists.id })
      .from(readingLists)
      .innerJoin(users, eq(users.id, readingLists.userId))
      .where(
        and(
          sql`left(${readingLists.id}::text, 8) = ${list[1].toLowerCase()}`,
          eq(readingLists.visibility, "public"),
          sql`${users.deletedAt} is null`,
          sql`${users.suspendedAt} is null`,
        ),
      )
      .limit(1);
    return !!row;
  }
  const match = /^\/@([^/]+)(?:\/(.+))?$/.exec(path);
  if (!match) return true;
  const slug = match[2];
  if (match[1].includes("@")) {
    if (slug && !/^[a-f0-9]{8}$/i.test(slug)) return false;
    const [row] = await db
      .select({ id: remoteActors.id })
      .from(remoteActors)
      .where(
        and(
          eq(remoteActors.handle, match[1]),
          ...(slug
            ? [
                sql`exists (select 1 from ${posts} where ${posts.remoteActorId} = ${remoteActors.id} and ${posts.remote} = true and ${posts.status} = 'published' and left(${posts.id}::text, 8) = ${slug.toLowerCase()})`,
              ]
            : []),
        ),
      )
      .limit(1);
    return !!row;
  }
  const postAddress =
    slug && /^[a-f0-9]{8}$/i.test(slug)
      ? sql`(${posts.slug} = ${slug} or (${posts.slug} is null and left(${posts.id}::text, 8) = ${slug.toLowerCase()}))`
      : sql`${posts.slug} = ${slug ?? ""}`;
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.username, match[1].toLowerCase()),
        eq(users.isPrivate, false),
        sql`${users.deletedAt} is null`,
        sql`${users.suspendedAt} is null`,
        ...(match[2]
          ? [
              sql`exists (select 1 from ${posts} where ${posts.authorId} = ${users.id} and ${postAddress} and ${posts.status} = 'published')`,
            ]
          : []),
      ),
    )
    .limit(1);
  return !!row;
}

const initialSketch = ({ index, rank }: Register) =>
  sql`set_byte(decode(repeat('00', ${REGISTERS}), 'hex'), ${index}::int, ${rank}::int)`;
const updateSketch = (
  column: typeof trafficBuckets.visitors | typeof trafficBuckets.visits,
  { index, rank }: Register,
) => sql`set_byte(${column}, ${index}::int, greatest(get_byte(${column}, ${index}::int), ${rank}::int))`;

export async function record(
  day: string,
  visitor: Register,
  visit: Register,
  dimensions: Omit<TrafficBreakdown, "pageviews">[],
): Promise<void> {
  await db.transaction(async (tx) => {
    // This row lock also serializes the cardinality cap, including concurrent new values.
    await tx
      .insert(trafficBuckets)
      .values({
        day,
        dimension: "total",
        value: "",
        pageviews: 1,
        visitors: initialSketch(visitor),
        visits: initialSketch(visit),
      })
      .onConflictDoUpdate({
        target: [trafficBuckets.day, trafficBuckets.dimension, trafficBuckets.value],
        set: {
          pageviews: sql`${trafficBuckets.pageviews} + 1`,
          visitors: updateSketch(trafficBuckets.visitors, visitor),
          visits: updateSketch(trafficBuckets.visits, visit),
        },
      });

    const existing = await tx
      .select({ dimension: trafficBuckets.dimension, value: trafficBuckets.value })
      .from(trafficBuckets)
      .where(eq(trafficBuckets.day, day));
    const rows = dimensions.map(({ dimension, value }) => ({
      day,
      dimension,
      pageviews: 1,
      value:
        existing.some((r) => r.dimension === dimension && r.value === value) ||
        existing.filter((r) => r.dimension === dimension && r.value !== OTHER_VALUE).length < MAX_DIMENSION_VALUES
          ? value
          : OTHER_VALUE,
    }));
    await tx
      .insert(trafficBuckets)
      .values(rows)
      .onConflictDoUpdate({
        target: [trafficBuckets.day, trafficBuckets.dimension, trafficBuckets.value],
        set: { pageviews: sql`${trafficBuckets.pageviews} + 1` },
      });
  });
}

export function dailyTotals(from: string, to: string) {
  return db
    .select({
      day: trafficBuckets.day,
      pageviews: trafficBuckets.pageviews,
      visitors: trafficBuckets.visitors,
      visits: trafficBuckets.visits,
    })
    .from(trafficBuckets)
    .where(and(eq(trafficBuckets.dimension, "total"), gte(trafficBuckets.day, from), lte(trafficBuckets.day, to)))
    .orderBy(trafficBuckets.day);
}

export async function breakdowns(from: string, to: string): Promise<TrafficBreakdown[]> {
  const rows = await db
    .select({
      dimension: trafficBuckets.dimension,
      value: trafficBuckets.value,
      pageviews: sql<number>`sum(${trafficBuckets.pageviews})::bigint`.mapWith(Number),
    })
    .from(trafficBuckets)
    .where(and(sql`${trafficBuckets.dimension} <> 'total'`, gte(trafficBuckets.day, from), lte(trafficBuckets.day, to)))
    .groupBy(trafficBuckets.dimension, trafficBuckets.value);
  return rows as TrafficBreakdown[];
}

export async function firstDay(): Promise<string | null> {
  const [row] = await db
    .select({ day: trafficBuckets.day })
    .from(trafficBuckets)
    .where(eq(trafficBuckets.dimension, "total"))
    .orderBy(trafficBuckets.day)
    .limit(1);
  return row?.day ?? null;
}

export async function prune(beforeDay: string): Promise<void> {
  await db.delete(trafficBuckets).where(lt(trafficBuckets.day, beforeDay));
}
