// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(import("@/db/repositories/webhookTokens.ts"));

import * as tokensRepo from "@/db/repositories/webhookTokens.ts";
import { hashToken } from "@/lib/webhook.ts";
import { list, MAX_TOKENS_PER_USER, mint, revoke } from "@/services/webhookTokens.ts";

const UUID = "0b0e7c4e-5d2a-4e0f-9f53-5f5a4f0d3a11";

beforeEach(() => {
  vi.mocked(tokensRepo.countForUser).mockResolvedValue(0);
  vi.mocked(tokensRepo.create).mockImplementation(async (userId, label, tokenHash) => ({
    id: UUID,
    userId,
    label,
    tokenHash,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date(),
  }));
});

describe("mint", () => {
  test("stores only the hash and returns the plaintext once", async () => {
    const { token, row } = await mint("me", "  Sanity  ");
    expect(row.label).toBe("Sanity");
    expect(row.tokenHash).toBe(await hashToken(token));
    expect(row.tokenHash).not.toBe(token);
    expect(tokensRepo.create).toHaveBeenCalledWith("me", "Sanity", row.tokenHash);
  });

  test("mints a different token every time", async () => {
    const a = await mint("me", "a");
    const b = await mint("me", "b");
    expect(a.token).not.toBe(b.token);
  });

  test.for([undefined, null, 42, "", "   ", { label: "x" }])("requires a label (%o)", async (label) => {
    await expect(mint("me", label)).rejects.toMatchObject({ status: 400 });
    expect(tokensRepo.create).not.toHaveBeenCalled();
  });

  test("accepts 60 characters and refuses 61", async () => {
    await expect(mint("me", "x".repeat(60))).resolves.toBeDefined();
    await expect(mint("me", "x".repeat(61))).rejects.toMatchObject({ status: 400 });
  });

  test("caps live tokens per account", async () => {
    vi.mocked(tokensRepo.countForUser).mockResolvedValue(MAX_TOKENS_PER_USER - 1);
    await expect(mint("me", "ok")).resolves.toBeDefined();
    vi.mocked(tokensRepo.countForUser).mockResolvedValue(MAX_TOKENS_PER_USER);
    await expect(mint("me", "one too many")).rejects.toMatchObject({
      status: 400,
      message: `You already have ${MAX_TOKENS_PER_USER} tokens. Revoke one before creating another.`,
    });
  });
});

test("list delegates to the owner's rows", async () => {
  vi.mocked(tokensRepo.listForUser).mockResolvedValue([]);
  expect(await list("me")).toEqual([]);
  expect(tokensRepo.listForUser).toHaveBeenCalledWith("me");
});

describe("revoke", () => {
  test("revokes an owned token", async () => {
    vi.mocked(tokensRepo.revoke).mockResolvedValue(true);
    await expect(revoke("me", UUID)).resolves.toBeUndefined();
    expect(tokensRepo.revoke).toHaveBeenCalledWith("me", UUID);
  });

  test("404s when the repository finds nothing (unknown or someone else's)", async () => {
    vi.mocked(tokensRepo.revoke).mockResolvedValue(false);
    await expect(revoke("me", UUID)).rejects.toMatchObject({ status: 404, message: "Token not found." });
  });

  test.for(["", "abc", "%", `${UUID}x`, "not-a-uuid-at-all-0000000000000000"])(
    "404s on a malformed id %j before touching the database",
    async (id) => {
      await expect(revoke("me", id)).rejects.toMatchObject({ status: 404 });
      expect(tokensRepo.revoke).not.toHaveBeenCalled();
    },
  );
});
