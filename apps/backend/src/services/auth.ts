import * as usersRepo from "@/db/repositories/users.ts";
import * as sessionsRepo from "@/db/repositories/sessions.ts";
import { hashPassword, verifyPassword } from "@/lib/password.ts";
import { newSessionToken, sessionExpiry } from "@/lib/session.ts";
import { badRequest, conflict, unauthorized } from "@/lib/http.ts";
import type { User } from "@/db/schema.ts";

// Business logic for authentication. First registered user becomes admin.

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

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
  if (input.password.length < 8) {
    throw badRequest("Password must be at least 8 characters.");
  }
  if (await usersRepo.findByUsername(username)) throw conflict("Username already taken.");
  if (await usersRepo.findByEmail(input.email)) throw conflict("Email already registered.");

  const isFirstUser = (await usersRepo.countUsers()) === 0;
  return usersRepo.create({
    username,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    displayName: input.displayName?.trim() || username,
    isAdmin: isFirstUser,
  });
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
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw unauthorized("Invalid username or password.");
  }
  const token = newSessionToken();
  const expiresAt = sessionExpiry();
  await sessionsRepo.create(token, user.id, expiresAt);
  return { user, token, expiresAt };
}

export function logout(token: string): Promise<void> {
  return sessionsRepo.remove(token);
}
