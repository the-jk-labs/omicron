import bcrypt from "bcryptjs";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { haveIBeenPwned, username } from "better-auth/plugins";
import { config } from "@/config.ts";
import { db } from "@/db/client.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { accounts, sessions, users, verifications } from "@/db/schema.ts";
import { queue } from "@/queue/queue.ts";

const BCRYPT_COST = 12;
const SESSION_TTL_S = 60 * 60 * 24 * 30;
const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

// Public origin for /api/auth; a wizard-changed domain is covered by forwarded headers below.
const baseURL = `${config.APP_DOMAIN.startsWith("localhost") ? "http" : "https"}://${config.APP_DOMAIN}`;

export const auth = betterAuth({
  baseURL,
  secret: config.SESSION_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, session: sessions, account: accounts, verification: verifications },
  }),
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 30,
      usernameValidator: (value) => USERNAME_RE.test(value),
    }),
    ...(config.HIBP_CHECK_ENABLED ? [haveIBeenPwned()] : []),
  ],
  advanced: {
    database: { generateId: "uuid" },
    trustedProxyHeaders: true,
    cookiePrefix: "omicron",
  },
  rateLimit: {
    storage: "memory",
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
    autoSignIn: true,
    requireEmailVerification: config.EMAIL_VERIFICATION_REQUIRED,
    password: {
      hash: (password) => bcrypt.hash(password, BCRYPT_COST),
      verify: ({ hash, password }) => bcrypt.compare(password, hash),
    },
    sendResetPassword: ({ user, url }) => {
      queue.add("send_password_reset", { to: user.email, url });
      return Promise.resolve();
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: ({ user, token }) => {
      queue.add("send_email_verification", {
        to: user.email,
        url: `${baseURL}/verify-email?token=${encodeURIComponent(token)}`,
      });
      return Promise.resolve();
    },
  },
  user: {
    fields: { name: "displayName", image: "avatarUrl" },
    // Declared so the create hook can persist it.
    additionalFields: {
      isAdmin: { type: "boolean", required: false, input: false, defaultValue: false },
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
    },
    session: {
      create: {
        // Block suspended accounts (runs after credential check, so no enumeration).
        before: async (session) => {
          const user = await usersRepo.findById(session.userId);
          if (user?.suspendedAt) throw new APIError("FORBIDDEN", { message: "This account has been suspended." });
          return { data: session };
        },
      },
    },
  },
});
