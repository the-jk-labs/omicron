// SPDX-License-Identifier: AGPL-3.0-or-later
import * as tokensRepo from "@/db/repositories/webhookTokens.ts";
import { badRequest, notFound } from "@/lib/http.ts";
import { generateToken, hashToken } from "@/lib/webhook.ts";
import type { WebhookToken } from "@/db/schema.ts";

// Per-user publishing tokens for the content webhook. A writer mints one per
// external system from Settings, pastes it into that system, and revokes it
// there if it leaks — without an admin, and without touching anyone else's
// integrations.
//
// The plaintext exists for exactly one HTTP response. Everything after that
// works off the SHA-256 hash, so neither a database dump nor this instance's
// operator can recover a token that has already been handed out.

/** How many live tokens one account may hold. */
export const MAX_TOKENS_PER_USER = 10;

export async function mint(userId: string, rawLabel: unknown): Promise<{
  token: string;
  row: WebhookToken;
}> {
  const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
  if (!label) throw badRequest("Give the token a name so you can recognise it later.");
  if (label.length > 60) throw badRequest("That name is too long (60 characters max).");

  if (await tokensRepo.countForUser(userId) >= MAX_TOKENS_PER_USER) {
    throw badRequest(
      `You already have ${MAX_TOKENS_PER_USER} tokens. Revoke one before creating another.`,
    );
  }

  const token = generateToken();
  const row = await tokensRepo.create(userId, label, await hashToken(token));
  return { token, row };
}

export function list(userId: string): Promise<WebhookToken[]> {
  return tokensRepo.listForUser(userId);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function revoke(userId: string, id: string): Promise<void> {
  // Reject a malformed id here: Postgres raises on a non-uuid comparison, which
  // would surface as a 500 for what is plainly a bad request.
  if (!UUID.test(id)) throw notFound("Token not found.");
  // Scoped to the owner inside the repository, so a wrong id and someone else's
  // id are indistinguishable from out here — both are simply "not found".
  if (!await tokensRepo.revoke(userId, id)) throw notFound("Token not found.");
}
