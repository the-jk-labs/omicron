// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { oauthApps, oauthCodes, oauthRequests, oauthTokens } from "@/db/schema.ts";

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

export function exchange(codeHash: string, tokenHash: string, expiresAt: Date) {
  return db.transaction(async (tx) => {
    const [code] = await tx
      .delete(oauthCodes)
      .where(and(eq(oauthCodes.codeHash, codeHash), gt(oauthCodes.expiresAt, new Date())))
      .returning();
    if (!code) return false;
    await tx.insert(oauthTokens).values({
      codeHash,
      tokenHash,
      expiresAt,
      clientId: code.clientId,
      userId: code.userId,
      redirectUri: code.redirectUri,
    });
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
  await db.delete(oauthTokens).where(and(eq(oauthTokens.tokenHash, tokenHash), eq(oauthTokens.clientId, clientId)));
}

export function listConnections(userId: string) {
  return db
    .select({
      id: oauthTokens.id,
      name: oauthApps.name,
      redirectUri: oauthTokens.redirectUri,
      createdAt: oauthTokens.createdAt,
      expiresAt: oauthTokens.expiresAt,
    })
    .from(oauthTokens)
    .innerJoin(oauthApps, eq(oauthTokens.clientId, oauthApps.id))
    .where(and(eq(oauthTokens.userId, userId), gt(oauthTokens.expiresAt, new Date())))
    .orderBy(desc(oauthTokens.createdAt));
}

export async function removeConnection(id: string, userId: string) {
  await db.delete(oauthTokens).where(and(eq(oauthTokens.id, id), eq(oauthTokens.userId, userId)));
}

export async function cleanup() {
  const now = new Date();
  await db.delete(oauthRequests).where(lt(oauthRequests.expiresAt, now));
  await db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, now));
  await db.delete(oauthTokens).where(lt(oauthTokens.expiresAt, now));
  // Unused dynamic registrations are disposable; active credentials keep their app.
  await db
    .delete(oauthApps)
    .where(
      and(
        isNull(oauthApps.authorizedAt),
        lt(oauthApps.createdAt, new Date(Date.now() - 30 * 86400_000)),
        sql`not exists (select 1 from ${oauthTokens} where ${oauthTokens.clientId} = ${oauthApps.id})`,
        sql`not exists (select 1 from ${oauthCodes} where ${oauthCodes.clientId} = ${oauthApps.id})`,
        sql`not exists (select 1 from ${oauthRequests} where ${oauthRequests.clientId} = ${oauthApps.id})`,
      ),
    );
}
