import { APIError } from "better-auth/api";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the real Better Auth endpoint with disposable in-memory storage.
const {
  store,
  addMail,
  settings,
  notifyPasskeyChanged,
  notifyEmailChangeCode,
  notifyEmailChangedBySelf,
  createUndoLink,
} = vi.hoisted(() => ({
  notifyEmailChangeCode: vi.fn<(to: string, code: string) => Promise<void>>(),
  notifyEmailChangedBySelf: vi.fn<(...args: string[]) => Promise<void>>(),
  createUndoLink: vi.fn<(...args: string[]) => Promise<string>>(),
  notifyPasskeyChanged: vi.fn<(change: string, userId: string, name: unknown) => Promise<void>>(),
  store: { user: [], account: [], session: [], verification: [], passkey: [] } as Record<
    string,
    Record<string, unknown>[]
  >,
  addMail: vi.fn<(name: string, payload: unknown) => void>(),
  settings: {} as Record<string, unknown>,
}));

vi.mock("@/db/client.ts", () => ({ db: {} }));
vi.mock("better-auth/adapters/drizzle", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return { drizzleAdapter: () => memoryAdapter(store) };
});
vi.mock("@/db/repositories/users.ts", () => ({
  findByEmail: (email: string) => Promise.resolve(store.user.find((user) => user.email === email)),
  findById: (id: string) => Promise.resolve(store.user.find((user) => user.id === id)),
  countUsers: () => Promise.resolve(store.user.length),
}));
vi.mock("@/queue/queue.ts", () => ({ queue: { add: addMail } }));
vi.mock("@/db/repositories/instanceSettings.ts", () => ({
  get: (key: string) => Promise.resolve(settings[key]),
  set: (key: string, value: unknown) => Promise.resolve(void (settings[key] = value)),
}));
vi.mock("@/services/accountNotices.ts", () => ({
  notifyPasswordChanged: vi.fn<() => Promise<void>>(),
  notifySelfDeleted: vi.fn<() => Promise<void>>(),
  notifyPasskeyChanged,
  notifyEmailChangeCode,
  notifyEmailChangedBySelf,
}));
vi.mock("@/services/emailChange.ts", () => ({ createUndoLink }));
vi.mock("@/db/repositories/passkeys.ts", () => ({
  findById: (id: string) => Promise.resolve(store.passkey.find((row) => row.id === id)),
}));

function existingUser(emailVerified: boolean) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    email: "taken@example.com",
    username: "existing_user",
    displayName: "Existing user",
    emailVerified,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function signUp(email: string) {
  const { auth } = await import("@/auth/auth.ts");
  return auth.handler(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({ email, password: "Unique-test-password-123!", name: "New user", username: "new_user" }),
    }),
  );
}

describe.each([true, false])("registration (email verification required: %s)", (verificationRequired) => {
  beforeEach(() => {
    vi.resetModules();
    for (const rows of Object.values(store)) rows.length = 0;
    addMail.mockClear();
    for (const key of Object.keys(settings)) delete settings[key];
    // auth.ts reads config when it is imported, and every test imports it fresh.
    vi.stubEnv("APP_DOMAIN", "localhost:3000");
    vi.stubEnv("HIBP_CHECK_ENABLED", "false");
    vi.stubEnv("EMAIL_VERIFICATION_REQUIRED", String(verificationRequired));
  });

  it.each([true, false])(
    "rejects an existing email (verified: %s) without changing the account or sending mail",
    async (verified) => {
      const user = existingUser(verified);
      const account = {
        id: "existing-account",
        userId: user.id,
        providerId: "credential",
        password: "original-password-hash",
      };
      store.user.push(user);
      store.account.push(account);
      const before = structuredClone(store);

      const response = await signUp("TAKEN@example.com");

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
        message: "This email is already registered. Sign in or reset your password.",
      });
      expect(store).toEqual(before);
      expect(addMail).not.toHaveBeenCalled();
    },
  );

  it("creates a new account and queues its verification email", async () => {
    store.user.push(existingUser(true));

    const response = await signUp("NEW@example.com");
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(store.user).toHaveLength(2);
    expect(result.user.email).toBe("new@example.com");
    expect(result.token === null).toBe(verificationRequired);
    expect(store.session).toHaveLength(verificationRequired ? 0 : 1);
    expect(addMail).toHaveBeenCalledExactlyOnceWith("send_email_verification", {
      to: "new@example.com",
      url: expect.stringContaining("http://localhost:3000/verify-email?token="),
    });
  });

  it("the verification link uses the domain set in the setup wizard", async () => {
    settings["instance.appDomain"] = "blog.example.com";
    await signUp("NEW@example.com");
    expect(addMail).toHaveBeenCalledWith("send_email_verification", {
      to: "new@example.com",
      url: expect.stringMatching(/^https:\/\/blog\.example\.com\/verify-email\?token=/),
    });
  });
});

describe("password reset", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const rows of Object.values(store)) rows.length = 0;
    for (const key of Object.keys(settings)) delete settings[key];
    addMail.mockClear();
    vi.stubEnv("APP_DOMAIN", "localhost:3000");
    vi.stubEnv("HIBP_CHECK_ENABLED", "false");
  });

  // Better Auth builds the link on its boot-time baseURL; the wizard's domain must win.
  it("the reset link uses the domain set in the setup wizard", async () => {
    store.user.push(existingUser(true));
    settings["instance.appDomain"] = "blog.example.com";
    const { auth } = await import("@/auth/auth.ts");
    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
        body: JSON.stringify({ email: "taken@example.com", redirectTo: "/reset-password" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(addMail).toHaveBeenCalledWith("send_password_reset", {
      to: "taken@example.com",
      url: expect.stringMatching(/^https:\/\/blog\.example\.com\/api\/auth\/reset-password\//),
    });
  });
});

describe("passkeys", () => {
  const cookies = new Map<string, string>();

  async function call(path: string, init: { method?: string; body?: unknown } = {}) {
    const { auth } = await import("@/auth/auth.ts");
    const res = await auth.handler(
      new Request(`http://localhost:3000/api/auth${path}`, {
        method: init.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
          Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      }),
    );
    for (const header of res.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const at = pair.indexOf("=");
      cookies.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return res;
  }

  async function signedIn(username: string) {
    cookies.clear();
    const res = await call("/sign-up/email", {
      method: "POST",
      body: { email: `${username}@example.com`, password: "Unique-test-password-123!", name: username, username },
    });
    expect(res.status).toBe(200);
    return (await res.json()).user.id as string;
  }

  function storedPasskey(userId: string, name: string) {
    const row = {
      id: crypto.randomUUID(),
      name,
      userId,
      publicKey: "pk",
      credentialID: crypto.randomUUID(),
      counter: 0,
      deviceType: "multiDevice",
      backedUp: true,
      transports: "internal",
      createdAt: new Date(),
    };
    store.passkey.push(row);
    return row;
  }

  beforeEach(() => {
    vi.resetModules();
    for (const rows of Object.values(store)) rows.length = 0;
    for (const key of Object.keys(settings)) delete settings[key];
    cookies.clear();
    vi.stubEnv("APP_DOMAIN", "localhost:3000");
    vi.stubEnv("HIBP_CHECK_ENABLED", "false");
    vi.stubEnv("EMAIL_VERIFICATION_REQUIRED", "false");
  });

  it("registering a passkey needs a session", async () => {
    expect((await call("/passkey/generate-register-options")).status).toBe(401);
  });

  // Adding a sign-in method is refused on an old session, before any browser prompt.
  it("registering a passkey needs a session started within the last day", async () => {
    await signedIn("ada");
    store.session[0].createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    for (const name of cookies.keys()) if (name.includes("session_data")) cookies.delete(name);
    const res = await call("/passkey/generate-register-options");
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("SESSION_NOT_FRESH");
  });

  it("binds new passkeys to the boot domain when the wizard set none", async () => {
    await signedIn("ada");
    const options = await (await call("/passkey/generate-register-options")).json();
    expect(options.rp).toEqual({ id: "localhost", name: "Omicron" });
    // The username is the one login identifier everywhere; it never changes.
    expect(options.user.name).toBe("ada");
  });

  // Better Auth would otherwise use its boot-time baseURL (APP_DOMAIN) as the RP ID.
  it("binds passkeys to the domain and name set in the setup wizard", async () => {
    settings["instance.appDomain"] = "blog.example.com:8443";
    settings["instance.appName"] = "Ada's blog";
    await signedIn("ada");

    const register = await (await call("/passkey/generate-register-options")).json();
    expect(register.rp).toEqual({ id: "blog.example.com", name: "Ada's blog" });

    cookies.clear();
    const signIn = await (await call("/passkey/generate-authenticate-options")).json();
    expect(signIn.rpId).toBe("blog.example.com");
  });

  it("lists, renames and deletes only the signed-in user's passkeys", async () => {
    const other = storedPasskey("someone-else", "Their key");
    const ada = await signedIn("ada");
    const mine = storedPasskey(ada, "Laptop");

    const listed = await (await call("/passkey/list-user-passkeys")).json();
    expect(listed.map((p: { id: string }) => p.id)).toEqual([mine.id]);

    const renamed = await call("/passkey/update-passkey", {
      method: "POST",
      body: { id: mine.id, name: "Work laptop" },
    });
    expect(renamed.status).toBe(200);
    expect(mine.name).toBe("Work laptop");

    expect(
      (await call("/passkey/update-passkey", { method: "POST", body: { id: other.id, name: "Mine now" } })).ok,
    ).toBe(false);
    expect((await call("/passkey/delete-passkey", { method: "POST", body: { id: other.id } })).ok).toBe(false);
    expect(other.name).toBe("Their key");

    expect((await call("/passkey/delete-passkey", { method: "POST", body: { id: mine.id } })).status).toBe(200);
    expect(store.passkey).toEqual([other]);
  });

  it("tells the owner when one of their passkeys is removed, and only then", async () => {
    const other = storedPasskey("someone-else", "Their key");
    const ada = await signedIn("ada");
    const mine = storedPasskey(ada, "Laptop");

    await call("/passkey/update-passkey", { method: "POST", body: { id: mine.id, name: "Work laptop" } });
    await call("/passkey/delete-passkey", { method: "POST", body: { id: other.id } });
    await call("/passkey/delete-passkey", { method: "POST", body: { id: "no-such-passkey" } });
    expect(notifyPasskeyChanged).not.toHaveBeenCalled();

    await call("/passkey/delete-passkey", { method: "POST", body: { id: mine.id } });
    expect(notifyPasskeyChanged).toHaveBeenCalledExactlyOnceWith("removed", ada, "Work laptop");
  });

  // A real registration needs a WebAuthn ceremony, so the hook gets the plugin's results directly.
  it("tells the owner when a passkey is added, but not when registration failed", async () => {
    const { auth } = await import("@/auth/auth.ts");
    const after = (returned: unknown) =>
      auth.options.hooks.after({ path: "/passkey/verify-registration", context: { returned } } as never);

    await after(new APIError("BAD_REQUEST", { message: "Failed to verify registration" }));
    expect(notifyPasskeyChanged).not.toHaveBeenCalled();

    await after({ id: "p1", userId: "u1", name: "1Password" });
    expect(notifyPasskeyChanged).toHaveBeenCalledExactlyOnceWith("added", "u1", "1Password");
  });

  it("refuses a passkey name over 60 characters", async () => {
    const mine = storedPasskey(await signedIn("ada"), "Laptop");
    const res = await call("/passkey/update-passkey", { method: "POST", body: { id: mine.id, name: "x".repeat(61) } });
    expect(res.status).toBe(400);
    expect(mine.name).toBe("Laptop");
  });
});

describe("changing the login email", () => {
  const cookies = new Map<string, string>();

  async function call(path: string, body?: unknown) {
    const { auth } = await import("@/auth/auth.ts");
    const res = await auth.handler(
      new Request(`http://localhost:3000/api/auth${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
          Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        },
        body: JSON.stringify(body ?? {}),
      }),
    );
    for (const header of res.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const at = pair.indexOf("=");
      cookies.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return res;
  }

  async function signedIn() {
    const res = await call("/sign-up/email", {
      email: "ada@example.com",
      password: "Unique-test-password-123!",
      name: "Ada",
      username: "ada",
    });
    expect(res.status).toBe(200);
    return (await res.json()).user.id as string;
  }

  // Sessions older than the 15 minutes since the dialog's password re-check.
  function ageSession(minutes: number) {
    store.session[0].createdAt = new Date(Date.now() - minutes * 60 * 1000);
    for (const name of cookies.keys()) if (name.includes("session_data")) cookies.delete(name);
  }

  beforeEach(() => {
    vi.resetModules();
    for (const rows of Object.values(store)) rows.length = 0;
    for (const key of Object.keys(settings)) delete settings[key];
    cookies.clear();
    vi.stubEnv("APP_DOMAIN", "localhost:3000");
    vi.stubEnv("HIBP_CHECK_ENABLED", "false");
    vi.stubEnv("EMAIL_VERIFICATION_REQUIRED", "false");
    createUndoLink.mockResolvedValue("https://blog.example/undo-email-change?token=t");
  });

  it("changes it with a code sent to the new address, then tells the old one", async () => {
    const ada = await signedIn();

    expect((await call("/email-otp/request-email-change", { newEmail: "New@Example.com" })).status).toBe(200);
    expect(notifyEmailChangeCode).toHaveBeenCalledExactlyOnceWith("new@example.com", expect.stringMatching(/^\d{6}$/));
    expect(store.user[0].email).toBe("ada@example.com");

    const code = notifyEmailChangeCode.mock.calls[0][1];
    expect((await call("/email-otp/change-email", { newEmail: "new@example.com", otp: code })).status).toBe(200);
    expect(store.user[0]).toMatchObject({ email: "new@example.com", emailVerified: true });
    expect(createUndoLink).toHaveBeenCalledWith(ada, "ada@example.com", "new@example.com");
    expect(notifyEmailChangedBySelf).toHaveBeenCalledWith(
      "ada@example.com",
      "ada",
      "new@example.com",
      "https://blog.example/undo-email-change?token=t",
    );
  });

  it("a wrong code changes nothing and tells no one", async () => {
    await signedIn();
    await call("/email-otp/request-email-change", { newEmail: "new@example.com" });
    const code = notifyEmailChangeCode.mock.calls[0][1];
    const wrong = code === "000000" ? "111111" : "000000";
    expect((await call("/email-otp/change-email", { newEmail: "new@example.com", otp: wrong })).ok).toBe(false);
    expect(store.user[0].email).toBe("ada@example.com");
    expect(notifyEmailChangedBySelf).not.toHaveBeenCalled();
  });

  it.each(["/email-otp/request-email-change", "/email-otp/change-email"])(
    "%s refuses a session older than the password re-check",
    async (path) => {
      await signedIn();
      ageSession(16);
      const res = await call(path, { newEmail: "new@example.com", otp: "123456" });
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("PASSWORD_REQUIRED");
      expect(notifyEmailChangeCode).not.toHaveBeenCalled();
      expect(store.user[0].email).toBe("ada@example.com");
    },
  );

  it("refuses an address another account already uses, without sending a code", async () => {
    await signedIn();
    store.user.push({ ...store.user[0], id: "other", email: "taken@example.com", username: "other" });
    const res = await call("/email-otp/request-email-change", { newEmail: "Taken@example.com" });
    expect(res.status).toBe(422);
    expect((await res.json()).message).toBe("This email is already in use.");
    expect(notifyEmailChangeCode).not.toHaveBeenCalled();
  });

  // Each request mails a code to an address of the requester's choosing.
  it("caps code requests so the instance can't be used to flood an inbox", async () => {
    const { auth } = await import("@/auth/auth.ts");
    expect(auth.options.rateLimit?.customRules?.["/email-otp/request-email-change"]).toEqual({ window: 60, max: 3 });
  });

  it.each([
    "/sign-in/email-otp",
    "/email-otp/send-verification-otp",
    "/email-otp/check-verification-otp",
    "/email-otp/verify-email",
    "/email-otp/request-password-reset",
    "/email-otp/reset-password",
    "/forget-password/email-otp",
  ])("the plugin's %s is switched off", async (path) => {
    const res = await call(path, { email: "ada@example.com", type: "sign-in", otp: "123456" });
    expect(res.status).toBe(404);
  });
});

// Undoing an email change, a revoke and an admin suspension all delete session
// rows, but the browser keeps Better Auth's cached copy of the session (the
// `session_data` cookie) for up to 5 minutes. Ordinary reads may trust it;
// anything sensitive must check the database (Better Auth: `disableCookieCache`).
describe("a session deleted from the database", () => {
  let headers: Headers;

  async function call(path: string) {
    const { auth } = await import("@/auth/auth.ts");
    return auth.handler(new Request(`http://localhost:3000/api/auth${path}`, { headers }));
  }

  beforeEach(async () => {
    vi.resetModules();
    for (const rows of Object.values(store)) rows.length = 0;
    for (const key of Object.keys(settings)) delete settings[key];
    vi.stubEnv("APP_DOMAIN", "localhost:3000");
    vi.stubEnv("HIBP_CHECK_ENABLED", "false");
    vi.stubEnv("EMAIL_VERIFICATION_REQUIRED", "false");
    const { auth } = await import("@/auth/auth.ts");
    const registered = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
        body: JSON.stringify({
          email: "ada@example.com",
          password: "Unique-test-password-123!",
          name: "Ada",
          username: "ada",
        }),
      }),
    );
    const cookie = registered.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    headers = new Headers({ Cookie: cookie, Origin: "http://localhost:3000" });
    store.session.length = 0;
  });

  it("can't start registering a passkey with its cached cookie", async () => {
    expect((await call("/passkey/generate-register-options")).status).toBe(401);
  });

  it("can't list the account's sessions with its cached cookie", async () => {
    expect((await call("/list-sessions")).status).toBe(401);
  });

  it("is gone for a read that skips the cache", async () => {
    const { auth } = await import("@/auth/auth.ts");
    expect(await auth.api.getSession({ headers, query: { disableCookieCache: true } })).toBeNull();
  });

  // The cache stays on for ordinary reads; that's the point of having it.
  it("still answers an ordinary cached read until the cache expires", async () => {
    const { auth } = await import("@/auth/auth.ts");
    expect((await auth.api.getSession({ headers }))?.user.email).toBe("ada@example.com");
  });
});
