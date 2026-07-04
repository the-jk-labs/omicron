// SPDX-License-Identifier: AGPL-3.0-or-later

// DKIM (RFC 6376) key management, signing, and the DNS records an operator must
// publish. We sign with relaxed/relaxed canonicalization and rsa-sha256 — the
// widely-interoperable defaults. Keys are RSA-2048 generated with Web Crypto and
// stored (PKCS#8 / SPKI, base64) in the email settings.

const CRLF = "\r\n";

export interface DkimKeyPair {
  /** PKCS#8 private key, base64 (stored, never exposed). */
  privateKey: string;
  /** SPKI public key, base64 (published in the DNS TXT record). */
  publicKey: string;
}

const alg = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;

// Deno's lib types narrow BufferSource to ArrayBuffer-backed views; our byte
// arrays are always ArrayBuffer-backed, so this cast is safe.
function bs(u: Uint8Array): BufferSource {
  return u as unknown as BufferSource;
}

/** Generate a fresh RSA-2048 DKIM keypair. */
export async function generateKeyPair(): Promise<DkimKeyPair> {
  const pair = await crypto.subtle.generateKey(
    { ...alg, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ["sign", "verify"],
  );
  const priv = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const pub = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  return { privateKey: b64(priv), publicKey: b64(pub) };
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importPrivate(pkcs8b64: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey("pkcs8", bs(unb64(pkcs8b64)), alg, false, ["sign"]);
}

async function importPublic(spkib64: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey("spki", bs(unb64(spkib64)), alg, false, ["verify"]);
}

// ── Canonicalization (relaxed) ───────────────────────────────────────────────

function canonHeader(name: string, value: string): string {
  const n = name.toLowerCase().trimEnd();
  const v = value.replace(/\r\n/g, "").replace(/[ \t]+/g, " ").trim();
  return `${n}:${v}${CRLF}`;
}

function canonBody(body: string): string {
  let b = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  b = b
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").replace(/[ \t]+$/g, ""))
    .join("\n");
  b = b.replace(/\n/g, CRLF).replace(/(?:\r\n)+$/g, "");
  return b.length ? b + CRLF : "";
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bs(data)));
}

// ── Signing ──────────────────────────────────────────────────────────────────

export interface DkimSignOptions {
  domain: string;
  selector: string;
  privateKey: string;
}

// Headers signed, in order. Lower-case; only headers present are included.
const SIGNED_HEADERS = [
  "from",
  "to",
  "subject",
  "date",
  "message-id",
  "mime-version",
  "content-type",
  "content-transfer-encoding",
];

/**
 * Produce the `DKIM-Signature` header value for a message. Returns the full
 * header line (`DKIM-Signature: v=1; ...`) to prepend to the message.
 */
export async function signMessage(
  headers: [string, string][],
  body: string,
  opts: DkimSignOptions,
): Promise<string> {
  const enc = new TextEncoder();
  const bodyHash = b64(await sha256(enc.encode(canonBody(body))));

  // Resolve which signed headers are actually present, preserving SIGNED_HEADERS
  // order and using the message's values.
  const lower = new Map(headers.map(([n, v]) => [n.toLowerCase(), v] as const));
  const present = SIGNED_HEADERS.filter((h) => lower.has(h));
  const signedHeaderBlock = present.map((h) => canonHeader(h, lower.get(h)!)).join("");

  const t = Math.floor(Date.now() / 1000);
  const base = `v=1; a=rsa-sha256; c=relaxed/relaxed; d=${opts.domain}; s=${opts.selector}; ` +
    `t=${t}; bh=${bodyHash}; h=${present.join(":")}; b=`;

  // The DKIM-Signature header signs itself with an empty b= and no trailing CRLF.
  const dkimCanon = canonHeader("dkim-signature", base).replace(/\r\n$/, "");
  const toSign = enc.encode(signedHeaderBlock + dkimCanon);

  const key = await importPrivate(opts.privateKey);
  const sig = b64(new Uint8Array(await crypto.subtle.sign(alg.name, key, bs(toSign))));
  return `DKIM-Signature: ${base}${sig}`;
}

/**
 * Verify a signature this module produced — a self-check used in tests to prove
 * the signing pipeline is internally consistent (crypto + canonicalization).
 */
export async function verifyOwn(
  headers: [string, string][],
  body: string,
  dkimHeader: string,
  publicKey: string,
): Promise<boolean> {
  const enc = new TextEncoder();
  const value = dkimHeader.replace(/^DKIM-Signature:\s*/i, "");
  // Tag-boundary anchored so `h=` doesn't match inside `bh=`.
  const sig = unb64(value.match(/(?:^|;)\s*b=([^;]+)\s*$/)![1].replace(/\s+/g, ""));
  const bh = value.match(/(?:^|;)\s*bh=([^;]+)/)![1].replace(/\s+/g, "");
  const hTags = value.match(/(?:^|;)\s*h=([^;]+)/)![1]
    .split(":")
    .map((h) => h.trim().toLowerCase());

  // The body hash must match the canonicalized body, else the message was altered.
  if (b64(await sha256(enc.encode(canonBody(body)))) !== bh) return false;

  const lower = new Map(headers.map(([n, v]) => [n.toLowerCase(), v] as const));
  const signedHeaderBlock = hTags.map((h) => canonHeader(h, lower.get(h)!)).join("");
  const base = value.replace(/b=[^;]*$/i, "b=").replace(/\s+$/, "");
  const dkimCanon = canonHeader("dkim-signature", base).replace(/\r\n$/, "");
  const toSign = enc.encode(signedHeaderBlock + dkimCanon);

  return await crypto.subtle.verify(alg.name, await importPublic(publicKey), bs(sig), bs(toSign));
}

// ── DNS records the operator publishes ───────────────────────────────────────

export interface DnsRecords {
  spf: { host: string; type: "TXT"; value: string };
  dkim: { host: string; type: "TXT"; value: string };
  dmarc: { host: string; type: "TXT"; value: string };
}

/** The three records to publish for a sending domain + selector. */
export function dnsRecords(domain: string, selector: string, publicKey: string): DnsRecords {
  return {
    spf: { host: domain, type: "TXT", value: "v=spf1 a mx ~all" },
    dkim: {
      host: `${selector}._domainkey.${domain}`,
      type: "TXT",
      value: `v=DKIM1; k=rsa; p=${publicKey}`,
    },
    dmarc: {
      host: `_dmarc.${domain}`,
      type: "TXT",
      value: `v=DMARC1; p=none; rua=mailto:postmaster@${domain}`,
    },
  };
}
