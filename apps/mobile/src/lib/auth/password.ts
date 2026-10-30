import { fetch as nitroFetch } from "react-native-nitro-fetch";
import type { Fetcher } from "@/lib/api/client";

// Same policy as apps/frontend/src/lib/password.ts.
export const MIN_PASSWORD_LEN = 12;
export const MAX_PASSWORD_LEN = 128;

export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string };

const STRENGTHS: Strength[] = [
  { score: 0, label: "" },
  { score: 1, label: "Weak" },
  { score: 2, label: "Fair" },
  { score: 3, label: "Good" },
  { score: 4, label: "Strong" },
];

export function passwordStrength(pw: string): Strength {
  if (!pw) return { score: 0, label: "" };
  let score = 0;
  if (pw.length >= MIN_PASSWORD_LEN) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  if (pw.length >= 16 && score < 4) score += 1;
  if (score > 4) score = 4;
  // Below the minimum it is refused on submit, so it can't read as better than Weak.
  if (pw.length < MIN_PASSWORD_LEN) score = Math.min(score, 1);
  return STRENGTHS[score] ?? STRENGTHS[0];
}

export function passwordRequirements(pw: string) {
  return [
    { id: "len", label: `At least ${MIN_PASSWORD_LEN} characters`, ok: pw.length >= MIN_PASSWORD_LEN },
    { id: "case", label: "Upper and lower case", ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
    { id: "num", label: "At least one number", ok: /\d/.test(pw) },
    { id: "sym", label: "At least one symbol", ok: /[^A-Za-z0-9]/.test(pw) },
  ];
}

/** SHA-1 as uppercase hex. Hermes has no `crypto.subtle`, and HIBP's range API needs this digest. */
export function sha1Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;
  const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLength >>> 0);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));

  let [h0, h1, h2, h3, h4] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Uint32Array(80);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (x << 1) | (x >>> 31);
    }
    let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
    for (let i = 0; i < 80; i++) {
      const [f, k] =
        i < 20
          ? [(b & c) | (~b & d), 0x5a827999]
          : i < 40
            ? [b ^ c ^ d, 0x6ed9eba1]
            : i < 60
              ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc]
              : [b ^ c ^ d, 0xca62c1d6];
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      [e, d, c, b, a] = [d, c, (b << 30) | (b >>> 2), a, temp];
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4]
    .map((h) => (h >>> 0).toString(16).padStart(8, "0"))
    .join("")
    .toUpperCase();
}

/** HIBP k-anonymity check, as on the web: true/false, or null when skipped or failed (fail open). */
export async function isPwnedPassword(pw: string, fetch: Fetcher = nitroFetch): Promise<boolean | null> {
  if (pw.length < MIN_PASSWORD_LEN) return null;
  try {
    const hash = sha1Hex(pw);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) return null;
    const suffix = hash.slice(5);
    return (await res.text()).split("\n").some((line) => line.trim().split(":")[0]?.toUpperCase() === suffix);
  } catch {
    return null;
  }
}
