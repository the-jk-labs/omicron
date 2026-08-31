// SPDX-License-Identifier: AGPL-3.0-or-later
// Central password policy — single source for register, setup, reset, settings.
export const MIN_PASSWORD_LEN = 12;
export const MAX_PASSWORD_LEN = 128;

export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string };

export function passwordStrength(pw: string): Strength {
  if (!pw) return { score: 0, label: "" };
  let score = 0;
  if (pw.length >= MIN_PASSWORD_LEN) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  if (pw.length >= 16 && score < 4) score += 1;
  if (score > 4) score = 4;
  const labels = ["", "Weak", "Fair", "Good", "Strong"] as const;
  // oxlint-disable-next-line no-unsafe-type-assertion
  return { score: score as Strength["score"], label: labels[score] ?? "" };
}

export function passwordRequirements(pw: string) {
  return [
    { id: "len", label: `At least ${MIN_PASSWORD_LEN} characters`, ok: pw.length >= MIN_PASSWORD_LEN },
    { id: "case", label: "Upper and lower case", ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
    { id: "num", label: "At least one number", ok: /\d/.test(pw) },
    { id: "sym", label: "At least one symbol", ok: /[^A-Za-z0-9]/.test(pw) },
  ];
}

// Client-side k-anonymity HIBP check — same 5-char prefix model as the backend.
// Returns true/false/null (null = skipped/failed — fail-open).
export async function isPwnedPasswordClient(pw: string): Promise<boolean | null> {
  if (pw.length < MIN_PASSWORD_LEN) return null;
  try {
    const enc = new TextEncoder().encode(pw);
    const buf = await crypto.subtle.digest("SHA-1", enc);
    const bytes = new Uint8Array(buf);
    let hex = "";
    for (const b of bytes) hex += b.toString(16).padStart(2, "0");
    const upper = hex.toUpperCase();
    const prefix = upper.slice(0, 5);
    const suffix = upper.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) return null;
    const text = await res.text();
    for (const line of text.split("\n")) {
      const [hashSuffix] = line.trim().split(":");
      if (hashSuffix?.toUpperCase() === suffix) return true;
    }
    return false;
  } catch {
    return null;
  }
}
