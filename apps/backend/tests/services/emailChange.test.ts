// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";
import { userRow } from "../fixtures.ts";

vi.mock(import("@/db/repositories/accounts.ts"));
vi.mock(import("@/db/repositories/emailChangeUndo.ts"));
vi.mock(import("@/db/repositories/passkeys.ts"));
vi.mock(import("@/db/repositories/sessions.ts"));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/services/instanceSetup.ts"));
const requestPasswordReset = vi.hoisted(() => vi.fn<(a: unknown) => Promise<unknown>>());
vi.mock("@/auth/auth.ts", () => ({ auth: { api: { requestPasswordReset } } }));

import * as accountsRepo from "@/db/repositories/accounts.ts";
import * as undoRepo from "@/db/repositories/emailChangeUndo.ts";
import * as passkeysRepo from "@/db/repositories/passkeys.ts";
import * as sessionsRepo from "@/db/repositories/sessions.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { hashToken } from "@/lib/tokens.ts";
import { createUndoLink, undoEmailChange } from "@/services/emailChange.ts";
import { getOrigin } from "@/services/instanceSetup.ts";

const undo = { userId: "u1", oldEmail: "old@x.test", newEmail: "new@x.test" };
const issuedAt = new Date("2026-10-01T10:00:00Z");
const found = { ...undo, createdAt: issuedAt };

beforeEach(() => {
  vi.mocked(getOrigin).mockResolvedValue("https://blog.example");
});

describe("createUndoLink", () => {
  test("stores only the token's hash, for 7 days, and links the undo page", async () => {
    const before = Date.now();
    const url = await createUndoLink("u1", "old@x.test", "new@x.test");
    const token = new URL(url).searchParams.get("token")!;
    expect(url).toMatch(/^https:\/\/blog\.example\/undo-email-change\?token=[0-9a-f]{64}$/);
    const [hash, stored, expiresAt] = vi.mocked(undoRepo.create).mock.calls[0];
    expect(hash).toBe(await hashToken(token));
    expect(hash).not.toBe(token);
    expect(stored).toEqual(undo);
    expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000);
  });
});

describe("undoEmailChange", () => {
  test("puts the old address back and shuts out whoever changed it", async () => {
    vi.mocked(undoRepo.find).mockResolvedValue(found);
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "u1", email: "new@x.test" }));
    vi.mocked(usersRepo.findByEmail).mockResolvedValue(undefined);

    expect(await undoEmailChange("tok")).toBe("old@x.test");

    expect(undoRepo.find).toHaveBeenCalledWith(await hashToken("tok"));
    expect(usersRepo.update).toHaveBeenCalledWith("u1", { email: "old@x.test", emailVerified: true });
    expect(sessionsRepo.removeAllForUser).toHaveBeenCalledWith("u1");
    expect(passkeysRepo.deleteAllForUser).toHaveBeenCalledWith("u1");
    expect(accountsRepo.clearCredentialPassword).toHaveBeenCalledWith("u1");
    // This link and every later one go; earlier ones stay (see the integration test).
    expect(undoRepo.removeIssuedSince).toHaveBeenCalledWith("u1", issuedAt);
    expect(requestPasswordReset).toHaveBeenCalledWith({
      body: { email: "old@x.test", redirectTo: "/reset-password" },
    });
  });

  test("an unknown, expired or used token changes nothing", async () => {
    vi.mocked(undoRepo.find).mockResolvedValue(null);
    await expect(undoEmailChange("tok")).rejects.toThrow("This link has expired or was already used.");
    expect(usersRepo.update).not.toHaveBeenCalled();
  });

  test("a deleted account can't be restored this way", async () => {
    vi.mocked(undoRepo.find).mockResolvedValue(found);
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "u1", deletedAt: new Date() }));
    await expect(undoEmailChange("tok")).rejects.toThrow("This link has expired or was already used.");
    expect(usersRepo.update).not.toHaveBeenCalled();
  });

  test("an old address now held by another account is refused", async () => {
    vi.mocked(undoRepo.find).mockResolvedValue(found);
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "u1" }));
    vi.mocked(usersRepo.findByEmail).mockResolvedValue(userRow({ id: "someone-else", email: "old@x.test" }));
    await expect(undoEmailChange("tok")).rejects.toMatchObject({ status: 409 });
    expect(usersRepo.update).not.toHaveBeenCalled();
    expect(sessionsRepo.removeAllForUser).not.toHaveBeenCalled();
  });

  test("a failed reset mail doesn't undo the lockdown", async () => {
    vi.mocked(undoRepo.find).mockResolvedValue(found);
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "u1" }));
    vi.mocked(usersRepo.findByEmail).mockResolvedValue(undefined);
    requestPasswordReset.mockRejectedValue(new Error("smtp down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await undoEmailChange("tok")).toBe("old@x.test");
    expect(accountsRepo.clearCredentialPassword).toHaveBeenCalledWith("u1");
  });
});
