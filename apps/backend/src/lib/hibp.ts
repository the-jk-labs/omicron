// SPDX-License-Identifier: AGPL-3.0-or-later
// Have I Been Pwned k-anonymity check for leaked passwords.
// Only the first 5 hex chars of the SHA-1 are sent; the full hash never leaves the process.

const HIBP_API = "https://api.pwnedpasswords.com/range/";
const TIMEOUT_MS = 3500;

function sha1HexUpper(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  return crypto.subtle.digest("SHA-1", data).then((buf) => {
    const bytes = new Uint8Array(buf);
    let hex = "";
    for (const b of bytes) hex += b.toString(16).padStart(2, "0");
    return hex.toUpperCase();
  });
}

// Returns true when the password appears in the HIBP corpus.
// Fail-open on network/timeout errors so registration is not blocked by an
// external dependency (logged, but not surfaced to the caller).
export async function isPwnedPassword(password: string): Promise<boolean> {
  if (!password) return false;
  try {
    const hash = await sha1HexUpper(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${HIBP_API}${prefix}`, {
        headers: { "Add-Padding": "true", "User-Agent": "omicron" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(id);
    }
    if (!res.ok) {
      // 429 or transient failure — don't block the user.
      console.warn(`hibp: unexpected status ${res.status} for prefix ${prefix}`);
      return false;
    }
    const text = await res.text();
    const lines = text.split("\n");
    for (const line of lines) {
      const [hashSuffix] = line.trim().split(":");
      if (hashSuffix && hashSuffix.toUpperCase() === suffix) return true;
    }
    return false;
  } catch (err) {
    console.warn("hibp: check failed (fail-open):", err);
    return false;
  }
}
