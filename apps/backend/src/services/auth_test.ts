// SPDX-License-Identifier: AGPL-3.0-or-later
// Regression test for #120: a password change must invalidate every existing
// session (matching resetPassword) so a stolen cookie can't outlive the change,
// and must hand back one fresh session for the browser that performed it.
//
// The service pulls in modules that would touch Deno, Postgres and Redis at
// load time, so those are mocked; the real password (bcrypt) and session-token
// helpers are left intact so the assertions are about actual behavior, not
// mocks asserting against mocks.
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/config.ts", () => ({ config: { HIBP_CHECK_ENABLED: false } }));
vi.mock("@/db/repositories/authTokens.ts", () => ({
  create: vi.fn<() => Promise<void>>(),
  deleteForUser: vi.fn<() => Promise<void>>(),
  findValid: vi.fn<() => Promise<unknown>>(),
  markUsed: vi.fn<() => Promise<void>>(),
}));
vi.mock("@/db/repositories/sessions.ts", () => ({
  create: vi.fn<(rawToken: string, userId: string, expiresAt: Date) => Promise<void>>(),
  findUser: vi.fn<(rawToken: string) => Promise<unknown>>(),
  remove: vi.fn<(rawToken: string) => Promise<void>>(),
  removeAllForUser: vi.fn<(userId: string) => Promise<void>>(),
}));
vi.mock("@/db/repositories/users.ts", () => ({
  countUsers: vi.fn<() => Promise<number>>(),
  create: vi.fn<(data: unknown) => Promise<unknown>>(),
  findByEmail: vi.fn<(email: string) => Promise<unknown>>(),
  findByUsername: vi.fn<(username: string) => Promise<unknown>>(),
  findById: vi.fn<(id: string) => Promise<unknown>>(),
  update: vi.fn<(id: string, data: unknown) => Promise<void>>(),
}));
vi.mock("@/queue/queue.ts", () => ({ queue: { add: vi.fn<() => void>() } }));

import * as sessionsRepo from "@/db/repositories/sessions.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { HttpError } from "@/lib/http.ts";
import { hashPassword, verifyPassword } from "@/lib/password.ts";
import { changePassword } from "@/services/auth.ts";

const USER_ID = "user-123";
const CURRENT_PW = "current-password-1234";
const NEW_PW = "new-password-5678";

// Only the fields changePassword/verifyPassword touch matter; anything else that
// a full row would carry is irrelevant here.
function row(passwordHash: string): Record<string, unknown> {
  return { id: USER_ID, username: "tester", passwordHash };
}

beforeAll(async () => {
  const currentHash = await hashPassword(CURRENT_PW);
  vi.mocked(usersRepo.findById).mockResolvedValue(row(currentHash) as never);
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sessionsRepo.removeAllForUser).mockResolvedValue(undefined);
  vi.mocked(sessionsRepo.create).mockResolvedValue(undefined);
  vi.mocked(usersRepo.update).mockResolvedValue(undefined as never);
});

describe("changePassword", () => {
  test("revokes every session, stores the new hash, and returns a fresh session", async () => {
    const { token, expiresAt } = await changePassword(USER_ID, CURRENT_PW, NEW_PW);

    // The stored hash is replaced and verifies against the new password.
    expect(usersRepo.update).toHaveBeenCalledTimes(1);
    const [, updateData] = vi.mocked(usersRepo.update).mock.calls[0] as [string, { passwordHash: string }];
    const oldHash = await hashPassword(CURRENT_PW);
    expect(updateData.passwordHash).not.toBe(oldHash);
    expect(await verifyPassword(NEW_PW, updateData.passwordHash)).toBe(true);
    // ...and the old password is no longer valid.
    expect(await verifyPassword(CURRENT_PW, updateData.passwordHash)).toBe(false);

    // Every prior session is dropped — the actual fix for #120.
    expect(sessionsRepo.removeAllForUser).toHaveBeenCalledTimes(1);
    expect(sessionsRepo.removeAllForUser).toHaveBeenCalledWith(USER_ID);

    // Exactly one fresh session is created, for the browser that changed it.
    expect(sessionsRepo.create).toHaveBeenCalledTimes(1);
    const [savedToken, savedUserId, savedExpiry] = vi.mocked(sessionsRepo.create).mock.calls[0];
    expect(savedToken).toBe(token);
    expect(savedUserId).toBe(USER_ID);
    expect(savedExpiry).toBe(expiresAt);

    // The returned token is a fresh, high-entropy session token.
    expect(token.length).toBeGreaterThan(48);
  });

  test("rejects a wrong current password without touching sessions", async () => {
    await expect(changePassword(USER_ID, "definitely-wrong-pw", NEW_PW)).rejects.toBeInstanceOf(HttpError);
    expect(usersRepo.update).not.toHaveBeenCalled();
    expect(sessionsRepo.removeAllForUser).not.toHaveBeenCalled();
    expect(sessionsRepo.create).not.toHaveBeenCalled();
  });

  test("leaves sessions alone when the account no longer exists", async () => {
    vi.mocked(usersRepo.findById).mockResolvedValueOnce(null as never);
    await expect(changePassword(USER_ID, CURRENT_PW, NEW_PW)).rejects.toBeInstanceOf(HttpError);
    expect(sessionsRepo.removeAllForUser).not.toHaveBeenCalled();
    expect(sessionsRepo.create).not.toHaveBeenCalled();
  });
});
