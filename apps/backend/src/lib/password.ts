// SPDX-License-Identifier: AGPL-3.0-or-later
import bcrypt from "bcryptjs";

// Work factor for new hashes. Older hashes carry their own cost in the string,
// so raising this only affects passwords set from here on.
const BCRYPT_COST = 12;

// A valid bcrypt hash (of a throwaway value) used to burn an equivalent amount
// of CPU when the supplied account doesn't exist, so login timing can't be used
// to enumerate accounts. See services/auth.ts.
const DUMMY_HASH = "$2b$12$uhwBvVdgKLL2kb1h43gFi.l49vKqOsMPC0Qzy8vu.glAqm9CT2rxe";

// Password hashing isolated here so the algorithm can be swapped centrally.
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Runs a real bcrypt comparison against a fixed dummy hash and always returns
// false. Called on the no-such-user branch of login so that path takes the same
// time as verifying a real password.
export function verifyDummy(plain: string): Promise<boolean> {
  return bcrypt.compare(plain, DUMMY_HASH).then(() => false);
}
