import { getAuthenticatorName, passkey } from "@better-auth/passkey";
import bcrypt from "bcryptjs";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { haveIBeenPwned, username } from "better-auth/plugins";
import { config } from "@/config.ts";
import { db } from "@/db/client.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { accounts, passkeys, sessions, users, verifications } from "@/db/schema.ts";
import { queue } from "@/queue/queue.ts";
import { notifyPasswordChanged, notifySelfDeleted } from "@/services/accountNotices.ts";
import { getAppName, getOrigin } from "@/services/instanceSetup.ts";

const BCRYPT_COST = 12;
const SESSION_TTL_S = 60 * 60 * 24 * 30;
const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
const PASSKEY_NAME_MAX = 60;

// Public origin for /api/auth; a wizard-changed domain is covered by forwarded headers
// below. Links in emails are built from getOrigin() at send time instead.
const baseURL = `${config.APP_DOMAIN.startsWith("localhost") ? "http" : "https"}://${config.APP_DOMAIN}`;

export const auth = betterAuth({
  baseURL,
  secret: config.SESSION_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, session: sessions, account: accounts, verification: verifications, passkey: passkeys },
  }),
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 30,
      usernameValidator: (value) => USERNAME_RE.test(value),
    }),
    ...(config.HIBP_CHECK_ENABLED ? [haveIBeenPwned()] : []),
    passkey({
      registration: {
        // Unnamed passkeys get their provider's name ("1Password", "Windows Hello") when it is known.
        afterVerification: ({ verification }) =>
          Promise.resolve({ name: getAuthenticatorName(verification.registrationInfo?.aaguid) }),
      },
    }),
  ],
  advanced: {
    database: { generateId: "uuid" },
    trustedProxyHeaders: true,
    cookiePrefix: "omicron",
  },
  rateLimit: {
    storage: "memory",
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path.startsWith("/passkey/")) {
        const name: unknown = ctx.body?.name;
        if (typeof name === "string" && name.trim().length > PASSKEY_NAME_MAX) {
          throw new APIError("BAD_REQUEST", { message: `Passkey names are at most ${PASSKEY_NAME_MAX} characters.` });
        }
        // The plugin takes the WebAuthn RP ID from options.baseURL, fixed at boot to
        // APP_DOMAIN; a passkey must be bound to the live (wizard-set) domain instead.
        return { context: { context: { appName: await getAppName(), options: { baseURL: await getOrigin() } } } };
      }
      if (ctx.path !== "/sign-up/email" || typeof ctx.body?.email !== "string") return undefined;
      // Better Auth otherwise returns a synthetic success for duplicate emails
      // when verification is required, although no account or email is created.
      if (await usersRepo.findByEmail(ctx.body.email.toLowerCase())) {
        throw new APIError("UNPROCESSABLE_ENTITY", {
          code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
          message: "This email is already registered. Sign in or reset your password.",
        });
      }
      return undefined;
    }),
  },
  // Trust the real public origin (a wizard-set domain ≠ APP_DOMAIN) from forwarded headers.
  trustedOrigins: (request) => {
    const proto = request?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const host = request?.headers.get("x-forwarded-host") ?? request?.headers.get("host");
    return host ? [`${proto || "https"}://${host}`] : [];
  },
  session: {
    expiresIn: SESSION_TTL_S,
    cookieCache: { enabled: true, maxAge: 5 * 60, strategy: "jwe" },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    // When EMAIL_VERIFICATION_REQUIRED is set (the default), Better Auth skips
    // the session here and returns { token: null, user } — the account row
    // exists but cannot sign in until the confirmation link is clicked. This
    // is Mastodon parity: register → "check your inbox" → click → sign in.
    autoSignIn: true,
    requireEmailVerification: config.EMAIL_VERIFICATION_REQUIRED,
    password: {
      hash: (password) => bcrypt.hash(password, BCRYPT_COST),
      verify: ({ hash, password }) => bcrypt.compare(password, hash),
    },
    sendResetPassword: async ({ user, url }) => {
      // Better Auth builds `url` on the boot-time baseURL; swap in the live origin.
      const origin = await getOrigin();
      queue.add("send_password_reset", {
        to: user.email,
        url: url.startsWith(baseURL) ? origin + url.slice(baseURL.length) : url,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    // Mastodon parity: a sign-in attempt with an unverified address re-sends
    // the confirmation mail (rate-limited by the login limiter), the link
    // lives 24 hours, and clicking it signs the user straight in.
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, token }) => {
      queue.add("send_email_verification", {
        to: user.email,
        url: `${await getOrigin()}/verify-email?token=${encodeURIComponent(token)}`,
      });
    },
  },
  user: {
    fields: { name: "displayName", image: "avatarUrl" },
    // Declared so the create hook can persist them.
    additionalFields: {
      isAdmin: { type: "boolean", required: false, input: false, defaultValue: false },
      isModerator: { type: "boolean", required: false, input: false, defaultValue: false },
    },
    deleteUser: {
      enabled: true,
      // Federate Delete(actor) before Better Auth removes the row (cascades wipe the rest).
      beforeDelete: async (user) => {
        if (!(await import("@/services/federationState.ts")).federationRunning()) return;
        try {
          const { sendActorDelete } = await import("@/federation/outbound.ts");
          await sendActorDelete(user.id);
        } catch (err) {
          console.error("deleteUser: federated Delete failed (continuing):", err);
        }
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // First account becomes admin, trusted as verified.
        before: async (user) => {
          const isFirst = (await usersRepo.countUsers()) === 0;
          return isFirst ? { data: { ...user, isAdmin: true, emailVerified: true } } : { data: user };
        },
      },
      delete: {
        // Self-service deletion receipt. The row is already gone; the hook
        // carries the address. (Moderator deletion is a soft-delete and never
        // reaches this hook — see services/moderation.ts.)
        after: async (user) => {
          if (typeof user.email === "string" && typeof user.username === "string") {
            await notifySelfDeleted(user.email, user.username);
          }
        },
      },
    },
    account: {
      update: {
        // Any update to a credential account is a password change (change or
        // reset — the only writes this app makes to those rows), so the owner
        // gets a security notice pointing at the reset flow.
        after: async (account) => {
          if (account.providerId === "credential" && typeof account.userId === "string") {
            await notifyPasswordChanged(account.userId);
          }
        },
      },
    },
    session: {
      create: {
        // Block suspended and deleted accounts (runs after credential check, so no enumeration).
        before: async (session) => {
          const user = await usersRepo.findById(session.userId);
          if (user?.deletedAt) throw new APIError("FORBIDDEN", { message: "This account no longer exists." });
          if (user?.suspendedAt) throw new APIError("FORBIDDEN", { message: "This account has been suspended." });
          return { data: session };
        },
      },
    },
  },
});
