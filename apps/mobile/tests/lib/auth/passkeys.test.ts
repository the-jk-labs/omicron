// oxlint-disable typescript/no-unsafe-type-assertion -- a deliberately partial test double
import { Platform } from "react-native";
import { fetch as nitroFetch } from "react-native-nitro-fetch";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { InstanceAuthClient } from "@/lib/auth/auth-client";
import {
  changesSession,
  dismissPasskeyPrompt,
  passkeyPromptDismissed,
  resetPasskeyPrompt,
} from "@/lib/auth/passkey-prompt";
import {
  addPasskey,
  addPasskeyError,
  deviceSupportsPasskeys,
  instanceAllowsApp,
  loadPasskeys,
  passkeyLabel,
  passkeySignInError,
  signInWithPasskey,
} from "@/lib/auth/passkeys";

vi.mock("@/components/instance-provider", () => ({ useInstance: () => ({ origin: "https://omicron.test" }) }));

type AuthResult = { data?: unknown; error?: { code?: string; message?: string } | null };

const add = vi.fn<() => Promise<AuthResult>>();
const list = vi.fn<() => Promise<AuthResult>>();
const signIn = vi.fn<() => Promise<AuthResult>>();
const auth = {
  passkey: { addPasskey: add, listUserPasskeys: list },
  signIn: { passkey: signIn },
} as unknown as InstanceAuthClient;

const LOGIN_CREDS = "delegate_permission/common.get_login_creds";
const respond = (status: number, body: unknown) =>
  vi.mocked(nitroFetch).mockResolvedValue(new Response(JSON.stringify(body), { status }));
const statement = (relation: string[], package_name = "blog.omicron.app") => ({
  relation,
  target: { namespace: "android_app", package_name },
});

describe("deviceSupportsPasskeys", () => {
  test("needs Android 9", () => {
    expect(deviceSupportsPasskeys()).toBe(true);
    vi.spyOn(Platform, "Version", "get").mockReturnValue(27);
    expect(deviceSupportsPasskeys()).toBe(false);
  });

  test("leaves out iOS, which would need each instance's domain built into the app", () => {
    vi.spyOn(Platform, "OS", "get").mockReturnValue("ios");
    expect(deviceSupportsPasskeys()).toBe(false);
  });
});

describe("instanceAllowsApp", () => {
  test("asks the instance itself", async () => {
    respond(200, [statement([LOGIN_CREDS])]);
    await expect(instanceAllowsApp("https://omicron.test", "blog.omicron.app")).resolves.toBe(true);
    expect(vi.mocked(nitroFetch).mock.calls[0]?.[0]).toBe("https://omicron.test/.well-known/assetlinks.json");
  });

  test.each([
    ["no file", 404, {}],
    ["only app links", 200, [statement(["delegate_permission/common.handle_all_urls"])]],
    ["another app", 200, [statement([LOGIN_CREDS], "org.example.blog")]],
    ["a file of another shape", 200, { nope: true }],
  ])("says no for %s", async (_name, status, body) => {
    respond(status, body);
    await expect(instanceAllowsApp("https://omicron.test", "blog.omicron.app")).resolves.toBe(false);
  });

  test("a dev build isn't the released app", async () => {
    respond(200, [statement([LOGIN_CREDS])]);
    await expect(instanceAllowsApp("https://omicron.test", "blog.omicron.app.dev")).resolves.toBe(false);
  });
});

describe("passkeySignInError", () => {
  test.each(["ERROR_CEREMONY_ABORTED", "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY"])("%s stays quiet", (code) => {
    expect(passkeySignInError({ code })).toBeNull();
  });

  test("a device with no passkey says so rather than doing nothing", () => {
    expect(passkeySignInError({ code: "AUTH_CANCELLED", message: "Auth cancelled" })).toMatch(
      /couldn't find a passkey/i,
    );
  });

  test("names an instance that doesn't vouch for the app", () => {
    expect(passkeySignInError({ code: "ERROR_INVALID_RP_ID" })).toMatch(/hasn't enabled passkeys/i);
  });

  test("hides the library's misleading message for other ceremony failures", () => {
    expect(passkeySignInError({ code: "ERROR_AUTHENTICATOR_GENERAL_ERROR", message: "Auth cancelled" })).toBe(
      "Passkey sign-in failed. Try again.",
    );
  });

  test("explains what the server refuses, and falls back to its message", () => {
    expect(passkeySignInError({ code: "PASSKEY_NOT_FOUND" })).toMatch(/isn't registered/i);
    expect(passkeySignInError({ code: "AUTHENTICATION_FAILED" })).toMatch(/couldn't be verified/i);
    expect(passkeySignInError({ code: "BANNED", message: "Account suspended" })).toBe("Account suspended");
    expect(passkeySignInError({})).toBe("Passkey sign-in failed.");
  });
});

describe("addPasskeyError", () => {
  test("a cancel stays quiet", () => {
    expect(addPasskeyError({ code: "ERROR_CEREMONY_ABORTED" })).toBeNull();
  });

  test("explains the failures people can act on", () => {
    expect(addPasskeyError({ code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" })).toMatch(/already has a passkey/i);
    expect(addPasskeyError({ code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY" })).toMatch(/cancelled or timed out/i);
    expect(addPasskeyError({ code: "ERROR_INVALID_RP_ID" })).toMatch(/hasn't enabled passkeys/i);
    expect(addPasskeyError({})).toBe("Could not add the passkey.");
  });
});

describe("addPasskey", () => {
  test.each<[string, AuthResult, unknown]>([
    ["added", { data: {} }, "added"],
    ["an old sign-in", { error: { code: "SESSION_NOT_FRESH" } }, "needs-password"],
    ["a cancel", { error: { code: "ERROR_CEREMONY_ABORTED" } }, "cancelled"],
    ["a failure", { error: { message: "Nope" } }, { message: "Nope" }],
  ])("%s", async (_name, response, expected) => {
    add.mockResolvedValue(response);
    await expect(addPasskey(auth)).resolves.toEqual(expected);
  });

  test("a thrown failure becomes a message too", async () => {
    add.mockRejectedValue(new Error("Offline"));
    await expect(addPasskey(auth)).resolves.toEqual({ message: "Offline" });
  });
});

describe("signInWithPasskey", () => {
  const onSignedIn = vi.fn<() => Promise<void>>();

  beforeEach(() => {
    onSignedIn.mockResolvedValue(undefined);
  });

  test("refreshes the account once signed in", async () => {
    signIn.mockResolvedValue({ data: {} });
    await expect(signInWithPasskey(auth, onSignedIn)).resolves.toBe("signed-in");
    expect(onSignedIn).toHaveBeenCalledOnce();
  });

  test("a cancel changes nothing and shows nothing", async () => {
    signIn.mockResolvedValue({ error: { code: "ERROR_CEREMONY_ABORTED" } });
    await expect(signInWithPasskey(auth, onSignedIn)).resolves.toBeNull();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  test("failures come back as messages", async () => {
    signIn.mockResolvedValue({ error: { code: "AUTHENTICATION_FAILED" } });
    await expect(signInWithPasskey(auth, onSignedIn)).resolves.toEqual({ message: expect.any(String) });
    signIn.mockRejectedValue(new Error("Offline"));
    await expect(signInWithPasskey(auth, onSignedIn)).resolves.toEqual({ message: "Offline" });
  });
});

describe("loadPasskeys", () => {
  const row = { id: "a", name: null, backedUp: true, createdAt: "2026-11-01T00:00:00Z", extra: "dropped" };

  test("keeps the fields the screen shows", async () => {
    list.mockResolvedValue({ data: [row] });
    await expect(loadPasskeys(auth)).resolves.toEqual([
      { id: "a", name: null, backedUp: true, createdAt: "2026-11-01T00:00:00Z" },
    ]);
  });

  test("accepts dates the client already parsed", async () => {
    const createdAt = new Date("2026-11-01T00:00:00Z");
    list.mockResolvedValue({ data: [{ ...row, createdAt }] });
    await expect(loadPasskeys(auth)).resolves.toMatchObject([{ createdAt }]);
  });

  test("throws on a failure or an unreadable list", async () => {
    list.mockResolvedValue({ error: { message: "Nope" } });
    await expect(loadPasskeys(auth)).rejects.toThrow("Nope");
    list.mockResolvedValue({ data: [{ id: 1 }] });
    await expect(loadPasskeys(auth)).rejects.toThrow("Couldn't load your passkeys.");
  });
});

test("an unnamed passkey still reads as one", () => {
  const base = { id: "a", backedUp: false, createdAt: "2026-11-01T00:00:00Z" };
  expect(passkeyLabel({ ...base, name: "  " })).toBe("Passkey");
  expect(passkeyLabel({ ...base, name: "Pixel" })).toBe("Pixel");
});

describe("the offer's memory", () => {
  test("is kept per instance and cleared by a new session", () => {
    dismissPasskeyPrompt("https://a.test");
    expect(passkeyPromptDismissed("https://a.test")).toBe(true);
    expect(passkeyPromptDismissed("https://b.test")).toBe(false);
    resetPasskeyPrompt("https://a.test");
    expect(passkeyPromptDismissed("https://a.test")).toBe(false);
  });

  test.each([
    ["https://a.test/api/auth/sign-in/username", true],
    ["https://a.test/api/auth/sign-up/email", true],
    ["https://a.test/api/auth/sign-out", true],
    ["https://a.test/api/auth/verify-email", true],
    ["https://a.test/api/auth/passkey/verify-authentication", true],
    ["https://a.test/api/auth/get-session", false],
    ["https://a.test/api/auth/passkey/verify-registration", false],
  ])("%s starts or ends a session: %s", (url, expected) => {
    expect(changesSession(url)).toBe(expected);
  });
});
