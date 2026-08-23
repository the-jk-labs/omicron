// SPDX-License-Identifier: AGPL-3.0-or-later
import * as usersRepo from "@/db/repositories/users.ts";
import * as sessionsRepo from "@/db/repositories/sessions.ts";
import * as authTokensRepo from "@/db/repositories/authTokens.ts";
import { hashPassword, verifyDummy, verifyPassword } from "@/lib/password.ts";
import { newSessionToken, sessionExpiry } from "@/lib/session.ts";
import { hashToken, newToken } from "@/lib/tokens.ts";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "@/lib/http.ts";
import { config } from "@/config.ts";
import { queue } from "@/queue/queue.ts";
import { isPwnedPassword } from "@/lib/hibp.ts";
import type { User } from "@/db/schema.ts";

// Business logic for authentication. First registered user becomes admin.

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
// A plausible email address, and — the security-relevant part — one with no
// whitespace or control characters. This value is later used verbatim as the
// SMTP `RCPT TO:<…>` command and the `To:` MIME header (lib/smtp.ts, lib/mime.ts),
// so an unvalidated CR/LF in it would inject SMTP commands / mail headers (an
// open-relay / header-injection hole). `[^\s@]+` forbids exactly those bytes.
// Matches the shape already enforced on the public-profile email (services/users.ts).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LEN = 254; // RFC 5321 maximum address length
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60; // 1 hour
const EMAIL_VERIFY_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const MIN_PASSWORD_LEN = 12;
const MAX_PASSWORD_LEN = 128;
const MAX_DISPLAY_NAME_LEN = 60;

function assertPasswordLength(pw: string): void {
  if (pw.length < MIN_PASSWORD_LEN) {
    throw badRequest(`Password must be at least ${MIN_PASSWORD_LEN} characters.`);
  }
  if (pw.length > MAX_PASSWORD_LEN) {
    throw badRequest(`Password must be at most ${MAX_PASSWORD_LEN} characters.`);
  }
}

async function assertNotPwned(pw: string): Promise<void> {
  if (!config.HIBP_CHECK_ENABLED) return;
  if (await isPwnedPassword(pw)) {
    throw badRequest(
      "This password has appeared in a data breach — please choose a different one.",
    );
  }
}

// Issues a fresh single-use token of a purpose (invalidating any prior ones),
// stores only its hash, and returns the raw token for the emailed link.
async function issueToken(
  userId: string,
  purpose: authTokensRepo.AuthTokenPurpose,
  ttlMs: number,
): Promise<string> {
  await authTokensRepo.deleteForUser(userId, purpose);
  const raw = newToken();
  await authTokensRepo.create(userId, purpose, await hashToken(raw), new Date(Date.now() + ttlMs));
  return raw;
}

export async function register(input: {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}): Promise<User> {
  const username = input.username.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    throw badRequest("Username must be 3-30 chars: lowercase letters, numbers, underscore.");
  }
  // Validate the email before it is stored: it becomes the recipient of every
  // account email, used raw in the SMTP envelope and the `To:` header, so it
  // must be a single well-formed address with no embedded newline. The setup
  // wizard and admin routes validate via zod; this is the choke point for the
  // public /api/auth/register path, which does not.
  //
  // Lowercased, not merely trimmed: every lookup elsewhere (login, password
  // reset, resend) lowercases the identifier before `findByEmail`, so storing a
  // mixed-case address would (a) make the account unreachable at sign-in and
  // (b) let `Alice@x` and `alice@x` register as two rows past the unique index,
  // which is case-sensitive. Canonicalising here keeps one address ⇒ one account.
  const email = input.email.trim().toLowerCase();
  if (email.length > MAX_EMAIL_LEN || !EMAIL_RE.test(email)) {
    throw badRequest("Enter a valid email address.");
  }
  assertPasswordLength(input.password);
  await assertNotPwned(input.password);
  if (await usersRepo.findByUsername(username)) throw conflict("Username already taken.");
  if (await usersRepo.findByEmail(email)) throw conflict("Email already registered.");
  const rawDisplayName = input.displayName?.trim();
  if (rawDisplayName && rawDisplayName.length > MAX_DISPLAY_NAME_LEN) {
    throw badRequest(`Display name must be at most ${MAX_DISPLAY_NAME_LEN} characters.`);
  }

  const isFirstUser = (await usersRepo.countUsers()) === 0;
  const user = await usersRepo.create({
    username,
    email,
    passwordHash: await hashPassword(input.password),
    displayName: rawDisplayName || username,
    isAdmin: isFirstUser,
    // The instance owner (first account) is trusted implicitly, so their email
    // counts as verified — they can never be locked out of their own instance.
    emailVerifiedAt: isFirstUser ? new Date() : null,
  });

  if (!isFirstUser) await sendVerificationEmail(user);
  return user;
}

// Enqueues a verification email for a user. Fire-and-forget (off the request
// path); a no-op-ish console log in dev, real mail when SMTP is configured.
async function sendVerificationEmail(user: User): Promise<void> {
  const token = await issueToken(user.id, "email_verify", EMAIL_VERIFY_TTL_MS);
  queue.add("send_email_verification", { to: user.email, token });
}

// Verifies credentials and returns a fresh session token (caller sets cookie).
export async function login(identifier: string, password: string): Promise<{
  user: User;
  token: string;
  expiresAt: Date;
}> {
  const id = identifier.trim().toLowerCase();
  const user = id.includes("@")
    ? await usersRepo.findByEmail(id)
    : await usersRepo.findByUsername(id);
  // Always spend the cost of a bcrypt comparison, even when the account doesn't
  // exist, so response timing can't distinguish "no such user" from "wrong
  // password" (account enumeration). Same generic error either way.
  const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyDummy(password);
  if (!user || !ok) {
    throw unauthorized("Invalid username or password.");
  }
  // Suspended accounts cannot sign in. Checked after the password so it can't be
  // used to probe which accounts exist.
  if (user.suspendedAt) {
    throw forbidden("This account has been suspended.");
  }
  // Closed instances can require a confirmed email before first sign-in. The
  // error is distinct (403) so the client can surface a "resend" affordance.
  if (config.EMAIL_VERIFICATION_REQUIRED && !user.emailVerifiedAt) {
    throw forbidden("Please verify your email address before signing in.");
  }
  const token = newSessionToken();
  const expiresAt = sessionExpiry();
  await sessionsRepo.create(token, user.id, expiresAt);
  return { user, token, expiresAt };
}

export function logout(token: string): Promise<void> {
  return sessionsRepo.remove(token);
}

// ── Password reset ─────────────────────────────────────────────────────────

// Starts a reset: if the identifier matches an account, emails a tokened link.
// Always resolves without revealing whether the account exists (no enumeration);
// the caller returns the same response regardless.
export async function requestPasswordReset(identifier: string): Promise<void> {
  const id = identifier.trim().toLowerCase();
  if (!id) return;
  const user = id.includes("@")
    ? await usersRepo.findByEmail(id)
    : await usersRepo.findByUsername(id);
  if (!user) return;
  const token = await issueToken(user.id, "password_reset", PASSWORD_RESET_TTL_MS);
  queue.add("send_password_reset", { to: user.email, token });
}

// Completes a reset: validates the token, sets the new password, and drops all
// of the user's sessions so any pre-existing login must re-authenticate.
export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  assertPasswordLength(newPassword);
  await assertNotPwned(newPassword);
  const row = await authTokensRepo.findValid(await hashToken(rawToken), "password_reset");
  if (!row) throw badRequest("This reset link is invalid or has expired.");
  await usersRepo.update(row.userId, { passwordHash: await hashPassword(newPassword) });
  await authTokensRepo.markUsed(row.id);
  await sessionsRepo.removeAllForUser(row.userId);
}

// Changes the password of a signed-in user after confirming their current one.
// The active session is left intact (the user stays logged in where they are).
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  assertPasswordLength(newPassword);
  await assertNotPwned(newPassword);
  const user = await usersRepo.findById(userId);
  if (!user) throw notFound("Account not found.");
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw unauthorized("Current password is incorrect.");
  }
  await usersRepo.update(userId, { passwordHash: await hashPassword(newPassword) });
}

// ── Email verification ─────────────────────────────────────────────────────

// Confirms an email from a tokened link. Idempotent-ish: a spent token simply
// reads as invalid on a second use.
export async function verifyEmail(rawToken: string): Promise<void> {
  const row = await authTokensRepo.findValid(await hashToken(rawToken), "email_verify");
  if (!row) throw badRequest("This verification link is invalid or has expired.");
  await usersRepo.update(row.userId, { emailVerifiedAt: new Date() });
  await authTokensRepo.markUsed(row.id);
}

// Re-sends a verification email. Like the reset request, it never reveals
// whether the address maps to an (unverified) account.
export async function resendVerification(email: string): Promise<void> {
  const addr = email.trim().toLowerCase();
  if (!addr) return;
  const user = await usersRepo.findByEmail(addr);
  if (!user || user.emailVerifiedAt) return;
  await sendVerificationEmail(user);
}

// Permanently deletes the signed-in user's account after confirming their
// password. The actual removal (and the federated Delete(actor) broadcast that
// tells other instances to tombstone us) runs in a background job, so the
// request returns promptly and the caller can clear the session cookie.
export async function deleteAccount(userId: string, password: string): Promise<void> {
  const user = await usersRepo.findById(userId);
  if (!user) throw notFound("Account not found.");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw unauthorized("Incorrect password.");
  }
  queue.add("delete_actor", { userId });
}
