// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the real Better Auth endpoint with disposable in-memory storage.
const { store, addMail, settings } = vi.hoisted(() => ({
  store: { user: [], account: [], session: [], verification: [] } as Record<string, Record<string, unknown>[]>,
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
