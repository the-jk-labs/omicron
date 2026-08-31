import bcrypt from "bcryptjs";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { haveIBeenPwned, username } from "better-auth/plugins";
import { config } from "@/config.ts";
import { db } from "@/db/client.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { accounts, sessions, users, verifications } from "@/db/schema.ts";
import { queue } from "@/queue/queue.ts";

const BCRYPT_COST = 12;
const SESSION_TTL_S = 60 * 60 * 24 * 30;
const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

// Public origin where /api/auth is reachable (the frontend host). The wizard can
// override APP_DOMAIN at runtime; per-request forwarded headers (trustedProxyHeaders) cover that.
const baseURL = `${config.APP_DOMAIN.startsWith("localhost") ? "http" : "https"}://${config.APP_DOMAIN}`;

export const auth = betterAuth({
  baseURL,
  secret: config.SESSION_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, session: sessions, account: accounts, verification: verifications },
  }),
  advanced: {
    database: { generateId: "uuid" },
    trustedProxyHeaders: true,
    cookiePrefix: "omicron",
  },
  // The CSRF origin check must trust the real public origin, which on a
  // wizard-configured instance differs from the boot-time APP_DOMAIN. Derive it
  // per request from the forwarded headers (Caddy sets them, the SvelteKit proxy
  // passes them through), the same signal cookieSecure and federation use.
  trustedOrigins: (request) => {
    const proto = request?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const host = request?.headers.get("x-forwarded-host") ?? request?.headers.get("host");
    return host ? [`${proto || "https"}://${host}`] : [];
  },
  user: {
    fields: { name: "displayName", image: "avatarUrl" },
    // Server-managed; declared so the first-user hook below can persist it.
    additionalFields: {
      isAdmin: { type: "boolean", required: false, input: false, defaultValue: false },
    },
    deleteUser: {
      enabled: true,
      // Broadcast the federated Delete(actor) while the key pair + followers still
      // exist; Better Auth then removes the row and FK cascades wipe the rest.
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
  session: { expiresIn: SESSION_TTL_S },
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
    // Link to the frontend verify page (which confirms client-side via
    // authClient.verifyEmail), not Better Auth's redirect endpoint.
    sendVerificationEmail: ({ user, token }) => {
      queue.add("send_email_verification", {
        to: user.email,
        url: `${baseURL}/verify-email?token=${encodeURIComponent(token)}`,
      });
      return Promise.resolve();
    },
  },
  databaseHooks: {
    user: {
      create: {
        // First account becomes admin and is trusted as verified (owner can't be locked out).
        before: async (user) => {
          const isFirst = (await usersRepo.countUsers()) === 0;
          return isFirst ? { data: { ...user, isAdmin: true, emailVerified: true } } : { data: user };
        },
      },
    },
  },
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 30,
      usernameValidator: (value) => USERNAME_RE.test(value),
    }),
    ...(config.HIBP_CHECK_ENABLED ? [haveIBeenPwned()] : []),
  ],
});
