import { beforeEach, describe, expect, test, vi } from "vitest";
import { confirmPassword, loadSessions } from "@/lib/auth/account";
import type { InstanceAuthClient } from "@/lib/auth/auth-client";

type AuthResult = { data?: unknown; error?: { code?: string; message?: string } | null };

const listSessions = vi.fn<() => Promise<AuthResult>>();
const getSession = vi.fn<() => Promise<AuthResult>>();
const username = vi.fn<(body: unknown) => Promise<AuthResult>>();
const revokeSession = vi.fn<(body: unknown) => Promise<AuthResult>>();
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a deliberately partial test double
const auth = { listSessions, getSession, revokeSession, signIn: { username } } as unknown as InstanceAuthClient;

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: { token: "old" } } });
  revokeSession.mockResolvedValue({});
});

describe("loadSessions", () => {
  test("lists the devices and names this one", async () => {
    listSessions.mockResolvedValue({ data: [{ token: "old" }] });
    await expect(loadSessions(auth)).resolves.toEqual({ locked: false, items: [{ token: "old" }], current: "old" });
  });

  test("a sign-in older than a day is locked, not an error", async () => {
    listSessions.mockResolvedValue({ error: { code: "SESSION_NOT_FRESH" } });
    await expect(loadSessions(auth)).resolves.toEqual({ locked: true });
  });

  test("other failures throw their message", async () => {
    listSessions.mockResolvedValue({ error: { code: "INTERNAL", message: "Database is down" } });
    await expect(loadSessions(auth)).rejects.toThrow("Database is down");
  });

  test("a failure with no message still explains itself", async () => {
    listSessions.mockResolvedValue({ error: { code: "INTERNAL" } });
    await expect(loadSessions(auth)).rejects.toThrow("Couldn't load your devices.");
  });
});

describe("confirmPassword", () => {
  test("signs in again and ends the old session", async () => {
    username.mockResolvedValue({ data: {} });
    await expect(confirmPassword(auth, "ada", "secret")).resolves.toBeNull();
    expect(username).toHaveBeenCalledExactlyOnceWith({ username: "ada", password: "secret" });
    expect(revokeSession).toHaveBeenCalledExactlyOnceWith({ token: "old" });
  });

  test("a wrong password keeps the old session", async () => {
    username.mockResolvedValue({ error: { code: "INVALID_USERNAME_OR_PASSWORD" } });
    await expect(confirmPassword(auth, "ada", "nope")).resolves.toBe("Incorrect password.");
    expect(revokeSession).not.toHaveBeenCalled();
  });
});
