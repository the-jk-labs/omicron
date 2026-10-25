// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { oauthApps, oauthCodes, oauthRefreshTokens, oauthRequests, oauthTokens } from "@/db/schema.ts";

export async function createApp(values: typeof oauthApps.$inferInsert) {
  const [row] = await db.insert(oauthApps).values(values).returning();
  return row;
}

export function findApp(id: string) {
  return db.query.oauthApps.findFirst({ where: eq(oauthApps.id, id) });
}

export async function createRequest(values: typeof oauthRequests.$inferInsert) {
  await db.insert(oauthRequests).values(values);
}

// Consume consent and mint its code together; parallel approvals cannot both win.
export function decide(tokenHash: string, userId: string, sessionId: string, codeHash: string | null) {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .delete(oauthRequests)
      .where(
        and(
          eq(oauthRequests.tokenHash, tokenHash),
          eq(oauthRequests.userId, userId),
          eq(oauthRequests.sessionId, sessionId),
          gt(oauthRequests.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!request) return undefined;
    if (codeHash) {
      await tx.update(oauthApps).set({ authorizedAt: new Date() }).where(eq(oauthApps.id, request.clientId));
      await tx.insert(oauthCodes).values({
        codeHash,
        clientId: request.clientId,
        userId,
        redirectUri: request.redirectUri,
        scopes: request.scopes,
        codeChallenge: request.codeChallenge,
        expiresAt: new Date(Date.now() + 5 * 60_000),
      });
    }
    return request;
  });
}

export function findCode(codeHash: string, clientId: string, redirectUri: string) {
  return db.query.oauthCodes.findFirst({
    where: and(
      eq(oauthCodes.codeHash, codeHash),
      eq(oauthCodes.clientId, clientId),
      eq(oauthCodes.redirectUri, redirectUri),
      gt(oauthCodes.expiresAt, new Date()),
    ),
  });
}

export function exchange(
  codeHash: string,
  tokenHash: string,
  expiresAt: Date,
  refreshCredential?: { tokenHash: string; expiresAt: Date },
) {
  return db.transaction(async (tx) => {
    const [code] = await tx
      .delete(oauthCodes)
      .where(and(eq(oauthCodes.codeHash, codeHash), gt(oauthCodes.expiresAt, new Date())))
      .returning();
    if (!code) return false;
    const [grant] = await tx
      .insert(oauthTokens)
      .values({
        codeHash,
        tokenHash,
        expiresAt,
        clientId: code.clientId,
        userId: code.userId,
        redirectUri: code.redirectUri,
        scopes: code.scopes,
        refreshExpiresAt: refreshCredential?.expiresAt ?? null,
      })
      .returning();
    if (refreshCredential)
      await tx.insert(oauthRefreshTokens).values({ tokenHash: refreshCredential.tokenHash, grantId: grant.id });
    return true;
  });
}

export async function revokeCode(codeHash: string, clientId: string) {
  await db.delete(oauthTokens).where(and(eq(oauthTokens.codeHash, codeHash), eq(oauthTokens.clientId, clientId)));
}

export function findToken(tokenHash: string) {
  return db.query.oauthTokens.findFirst({
    where: and(eq(oauthTokens.tokenHash, tokenHash), gt(oauthTokens.expiresAt, new Date())),
  });
}

export async function revokeToken(tokenHash: string, clientId: string) {
  await db
    .delete(oauthTokens)
    .where(
      and(
        eq(oauthTokens.clientId, clientId),
        or(
          eq(oauthTokens.tokenHash, tokenHash),
          sql`${oauthTokens.id} in (select ${oauthRefreshTokens.grantId} from ${oauthRefreshTokens} where ${oauthRefreshTokens.tokenHash} = ${tokenHash})`,
        ),
      ),
    );
}

export async function findRefresh(tokenHash: string, clientId: string) {
  const [row] = await db
    .select({ grant: oauthTokens })
    .from(oauthRefreshTokens)
    .innerJoin(oauthTokens, eq(oauthRefreshTokens.grantId, oauthTokens.id))
    .where(
      and(
        eq(oauthRefreshTokens.tokenHash, tokenHash),
        eq(oauthTokens.clientId, clientId),
        gt(oauthTokens.refreshExpiresAt, new Date()),
      ),
    );
  return row?.grant;
}

// Lock the grant before inspecting reuse: parallel refreshes must not mint two successors.
export function refresh(
  tokenHash: string,
  clientId: string,
  nextAccessHash: string,
  nextRefreshHash: string,
  expiresAt: Date,
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ grant: oauthTokens })
      .from(oauthTokens)
      .innerJoin(oauthRefreshTokens, eq(oauthRefreshTokens.grantId, oauthTokens.id))
      .where(and(eq(oauthRefreshTokens.tokenHash, tokenHash), eq(oauthTokens.clientId, clientId)))
      .for("update", { of: oauthTokens });
    if (!row || !row.grant.refreshExpiresAt || row.grant.refreshExpiresAt <= new Date()) return false;
    const previous = await tx.query.oauthRefreshTokens.findFirst({
      where: eq(oauthRefreshTokens.tokenHash, tokenHash),
    });
    if (!previous || previous.usedAt) {
      await tx.delete(oauthTokens).where(eq(oauthTokens.id, row.grant.id));
      return false;
    }
    await tx.update(oauthRefreshTokens).set({ usedAt: new Date() }).where(eq(oauthRefreshTokens.tokenHash, tokenHash));
    await tx.update(oauthTokens).set({ tokenHash: nextAccessHash, expiresAt }).where(eq(oauthTokens.id, row.grant.id));
    await tx.insert(oauthRefreshTokens).values({ tokenHash: nextRefreshHash, grantId: row.grant.id });
    return true;
  });
}

export function listConnections(userId: string) {
  return db
    .select({
      id: oauthTokens.id,
      name: oauthApps.name,
      redirectUri: oauthTokens.redirectUri,
      createdAt: oauthTokens.createdAt,
      expiresAt: sql<Date>`coalesce(${oauthTokens.refreshExpiresAt}, ${oauthTokens.expiresAt})`.mapWith(
        oauthTokens.expiresAt,
      ),
      scopes: oauthTokens.scopes,
    })
    .from(oauthTokens)
    .innerJoin(oauthApps, eq(oauthTokens.clientId, oauthApps.id))
    .where(
      and(
        eq(oauthTokens.userId, userId),
        or(gt(oauthTokens.expiresAt, new Date()), gt(oauthTokens.refreshExpiresAt, new Date())),
      ),
    )
    .orderBy(desc(oauthTokens.createdAt));
}

export async function removeConnection(id: string, userId: string) {
  await db.delete(oauthTokens).where(and(eq(oauthTokens.id, id), eq(oauthTokens.userId, userId)));
}

export async function cleanup() {
  const now = new Date();
  await db.delete(oauthRequests).where(lt(oauthRequests.expiresAt, now));
  await db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, now));
  await db
    .delete(oauthTokens)
    .where(
      and(
        lt(oauthTokens.expiresAt, now),
        or(isNull(oauthTokens.refreshExpiresAt), lt(oauthTokens.refreshExpiresAt, now)),
      ),
    );
  // Client API registrations stay stable; only unused legacy identity registrations expire.
  await db
    .delete(oauthApps)
    .where(
      and(
        isNull(oauthApps.authorizedAt),
        eq(oauthApps.scopes, "read:accounts"),
        eq(oauthApps.publicClient, false),
        lt(oauthApps.createdAt, new Date(Date.now() - 30 * 86400_000)),
        sql`not exists (select 1 from ${oauthTokens} where ${oauthTokens.clientId} = ${oauthApps.id})`,
        sql`not exists (select 1 from ${oauthCodes} where ${oauthCodes.clientId} = ${oauthApps.id})`,
        sql`not exists (select 1 from ${oauthRequests} where ${oauthRequests.clientId} = ${oauthApps.id})`,
      ),
    );
}
