import { getAuthenticatorName, passkey } from "@better-auth/passkey";
import bcrypt from "bcryptjs";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { emailOTP, haveIBeenPwned, username } from "better-auth/plugins";
import { config } from "@/config.ts";
import { db } from "@/db/client.ts";
import * as passkeysRepo from "@/db/repositories/passkeys.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { accounts, type Passkey, passkeys, sessions, users, verifications } from "@/db/schema.ts";
import { queue } from "@/queue/queue.ts";
import {
  notifyEmailChangeCode,
  notifyEmailChangedBySelf,
  notifyPasskeyChanged,
  notifyPasswordChanged,
  notifySelfDeleted,
} from "@/services/accountNotices.ts";
import { createUndoLink } from "@/services/emailChange.ts";
import { getAppName, getOrigin } from "@/services/instanceSetup.ts";

const BCRYPT_COST = 12;
const SESSION_TTL_S = 60 * 60 * 24 * 30;
const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
const PASSKEY_NAME_MAX = 60;

// Better Auth reads the session for these through its cookie cache, which can
// outlive a revoked session by up to 5 minutes; they must check the database.
const AUTHORITATIVE_SESSION_PATHS = new Set([
  "/list-sessions",
  "/passkey/generate-register-options",
  "/passkey/verify-registration",
  "/passkey/list-user-passkeys",
  "/passkey/update-passkey",
  "/passkey/delete-passkey",
]);

// The settings dialog re-checks the password by signing in again right before
// an email change, so the change endpoints only take a session that new.
const EMAIL_CHANGE_SESSION_MAX_AGE_MS = 15 * 60 * 1000;
const EMAIL_CHANGE_PATHS = new Set(["/email-otp/request-email-change", "/email-otp/change-email"]);

// The account an email change is moving away from, read before the plugin
// updates it so the old address can be told.
const changingEmail = new WeakMap<Request, { userId: string; email: string; username: string }>();

// The passkey a delete request targets, read before the plugin removes it so the
// owner's notice can still name it.
const deletingPasskeys = new WeakMap<Request, Passkey>();

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
    // Only for changing the login email; its sign-in, verification and reset
    // endpoints are switched off in `disabledPaths` below.
    emailOTP({
      disableSignUp: true,
      otpLength: 6,
      expiresIn: 10 * 60,
      allowedAttempts: 5,
      storeOTP: "hashed",
      changeEmail: { enabled: true },
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type === "change-email") await notifyEmailChangeCode(email, otp);
      },
    }),
    passkey({
      registration: {
        // Unnamed passkeys get their provider's name ("1Password", "Windows Hello") when it is known.
        afterVerification: ({ verification }) =>
          Promise.resolve({ name: getAuthenticatorName(verification.registrationInfo?.aaguid) }),
      },
    }),
  ],
  disabledPaths: [
    "/sign-in/email-otp",
    "/email-otp/send-verification-otp",
    "/email-otp/check-verification-otp",
    "/email-otp/verify-email",
    "/email-otp/request-password-reset",
    "/email-otp/reset-password",
    "/forget-password/email-otp",
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
      if (AUTHORITATIVE_SESSION_PATHS.has(ctx.path) && !(await getSessionFromCtx(ctx, { disableCookieCache: true }))) {
        throw new APIError("UNAUTHORIZED", { message: "Unauthorized" });
      }
      if (ctx.path.startsWith("/passkey/")) {
        const name: unknown = ctx.body?.name;
        if (typeof name === "string" && name.trim().length > PASSKEY_NAME_MAX) {
          throw new APIError("BAD_REQUEST", { message: `Passkey names are at most ${PASSKEY_NAME_MAX} characters.` });
        }
        if (ctx.path === "/passkey/delete-passkey" && ctx.request && typeof ctx.body?.id === "string") {
          const row = await passkeysRepo.findById(ctx.body.id).catch(() => undefined);
          if (row) deletingPasskeys.set(ctx.request, row);
        }
        // The plugin takes the WebAuthn RP ID from options.baseURL, fixed at boot to
        // APP_DOMAIN; a passkey must be bound to the live (wizard-set) domain instead.
        return { context: { context: { appName: await getAppName(), options: { baseURL: await getOrigin() } } } };
      }
      if (EMAIL_CHANGE_PATHS.has(ctx.path)) {
        const session = await getSessionFromCtx(ctx);
        if (!session) return undefined;
        if (Date.now() - new Date(session.session.createdAt).getTime() > EMAIL_CHANGE_SESSION_MAX_AGE_MS) {
          throw new APIError("FORBIDDEN", {
            code: "PASSWORD_REQUIRED",
            message: "Confirm your password to change your email.",
          });
        }
        const newEmail: unknown = ctx.body?.newEmail;
        if (
          ctx.path === "/email-otp/request-email-change" &&
          typeof newEmail === "string" &&
          (await usersRepo.findByEmail(newEmail.trim().toLowerCase()))
        ) {
          throw new APIError("UNPROCESSABLE_ENTITY", { message: "This email is already in use." });
        }
        if (ctx.path === "/email-otp/change-email" && ctx.request) {
          const { id, email } = session.user;
          changingEmail.set(ctx.request, { userId: id, email, username: String(session.user.username) });
        }
        return undefined;
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
    // Tell the owner whenever a way to sign in is added or removed. Only on
    // success: a refused request (wrong owner, failed ceremony) returns an error.
    after: createAuthMiddleware(async (ctx) => {
      const returned: unknown = ctx.context.returned;
      if (!returned || returned instanceof Error) return undefined;
      if (ctx.path === "/passkey/verify-registration") {
        const added = returned as { userId?: string; name?: string | null };
        if (added.userId) await notifyPasskeyChanged("added", added.userId, added.name);
      } else if (ctx.path === "/passkey/delete-passkey" && ctx.request) {
        const removed = deletingPasskeys.get(ctx.request);
        if (removed) await notifyPasskeyChanged("removed", removed.userId, removed.name);
      } else if (ctx.path === "/email-otp/change-email" && ctx.request) {
        const from = changingEmail.get(ctx.request);
        const newEmail = String(ctx.body?.newEmail ?? "")
          .trim()
          .toLowerCase();
        if (from && newEmail) {
          const undoUrl = await createUndoLink(from.userId, from.email, newEmail);
          await notifyEmailChangedBySelf(from.email, from.username, newEmail, undoUrl);
        }
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
