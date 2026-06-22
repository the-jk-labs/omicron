// SPDX-License-Identifier: AGPL-3.0-or-later
import bcrypt from "bcryptjs";

// Password hashing isolated here so the algorithm can be swapped centrally.
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}