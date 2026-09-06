// SPDX-License-Identifier: AGPL-3.0-or-later
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { config } from "@/config.ts";

// Explicit SSRF guard for read-side federation (GET /api/remote/*).
//
// Fedify already refuses private-network URLs by default (validatePublicUrl on
// WebFinger + documentLoader, including redirect re-validation), but that
// protection lives in node_modules — invisible to this repo's tests and one
// `allowPrivateAddress: true` away from disappearing. This module makes the
// property explicit, fail-closed, and pinned by unit tests:
//
//   1. Syntactic layer (no I/O): reject localhost, *.localhost, private/reserved
//      IP literals (including decimal/octal/hex spellings like 2130706433 or
//      0x7f.0.0.1), 0.0.0.0, IPv6 loopback/link-local/unique-local/multicast,
//      single-label hosts (docker service names like `postgres`), and private
//      LAN suffixes (.local, .internal, …).
//   2. DNS layer: resolve the host and reject if ANY A/AAAA is private, or if
//      resolution fails at all (fail closed).
//
// When ALLOW_PRIVATE_FEDERATION=true (LAN dev only) every check is skipped.

function allowPrivate(): boolean {
  try {
    return (config as { ALLOW_PRIVATE_FEDERATION?: boolean }).ALLOW_PRIVATE_FEDERATION === true;
  } catch {
    return false;
  }
}

// Splits `host` / `host:port` / `[v6]` / `[v6]:port`. Returns null on malformed
// input. A bare IPv6 literal without brackets (`::1`) has more than one colon
// and is treated as host-without-port (bracketed form is required for a port).
export function splitHostPort(input: string): { host: string; port: string | null } | null {
  const s = input.trim();
  if (!s) return null;
  if (s.startsWith("[")) {
    const close = s.indexOf("]");
    if (close < 0) return null;
    const host = s.slice(1, close);
    const rest = s.slice(close + 1);
    if (!rest) return { host, port: null };
    if (!rest.startsWith(":")) return null;
    const port = rest.slice(1);
    if (!/^\d{1,5}$/.test(port)) return null;
    const n = Number(port);
    if (n < 1 || n > 65535) return null;
    return { host, port };
  }
  const colons = (s.match(/:/g) ?? []).length;
  if (colons > 1) return { host: s, port: null };
  if (colons === 1) {
    const idx = s.indexOf(":");
    const host = s.slice(0, idx);
    const port = s.slice(idx + 1);
    if (!host || !/^\d{1,5}$/.test(port)) return null;
    const n = Number(port);
    if (n < 1 || n > 65535) return null;
    return { host, port };
  }
  return { host: s, port: null };
}

export function normalizeHost(host: string): string {
  let h = host.trim().toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  if (h.endsWith(".")) h = h.slice(0, -1);
  return h;
}

// The host portion of a `user@host` (or `@user@host`) handle, without port,
// lowercased, brackets/trailing-dot stripped. Null when the handle is malformed
// (no @, empty user/host, illegal characters, bad port).
export function extractHandleHost(handle: string): string | null {
  const bare = handle.trim().replace(/^@/, "");
  const at = bare.lastIndexOf("@");
  if (at <= 0 || at === bare.length - 1) return null;
  const user = bare.slice(0, at);
  const hostport = bare.slice(at + 1);
  if (!user || user.includes("@")) return null;
  if (/[\s/?#]/.test(user) || /[\s/?#@]/.test(hostport)) return null;
  const split = splitHostPort(hostport);
  if (!split || !split.host) return null;
  if (/[\s/?#@]/.test(split.host)) return null;
  const host = normalizeHost(split.host);
  if (!host || host.length > 253) return null;
  return host;
}

// Parses one numeric IPv4 part: hex (0x..), octal (leading 0), else decimal.
function parseIPv4Part(part: string): number | null {
  if (!part) return null;
  if (/^0[xX][0-9a-fA-F]+$/.test(part)) {
    const v = parseInt(part, 16);
    return Number.isSafeInteger(v) && v >= 0 && v <= 0xffffffff ? v : null;
  }
  if (/^0[0-7]+$/.test(part) && part.length > 1) {
    const v = parseInt(part, 8);
    return Number.isSafeInteger(v) && v >= 0 && v <= 0xffffffff ? v : null;
  }
  if (/^\d+$/.test(part)) {
    // A leading zero with 8/9 is not valid octal — inet_aton rejects it.
    if (part.length > 1 && part.startsWith("0")) return null;
    const v = parseInt(part, 10);
    return Number.isSafeInteger(v) && v >= 0 && v <= 0xffffffff ? v : null;
  }
  return null;
}

// inet_aton semantics (1–4 parts) → 32-bit number. Null when not an IPv4 form.
export function parseIPv4ToNumber(input: string): number | null {
  const parts = input.split(".");
  if (parts.length < 1 || parts.length > 4) return null;
  const vals: number[] = [];
  for (const p of parts) {
    const v = parseIPv4Part(p);
    if (v === null) return null;
    vals.push(v);
  }
  if (vals.length === 4) {
    if (vals.some((v) => v > 255)) return null;
    return vals[0] * 2 ** 24 + vals[1] * 2 ** 16 + vals[2] * 2 ** 8 + vals[3];
  }
  if (vals.length === 3) {
    if (vals[0] > 255 || vals[1] > 255 || vals[2] > 65535) return null;
    return vals[0] * 2 ** 24 + vals[1] * 2 ** 16 + vals[2];
  }
  if (vals.length === 2) {
    if (vals[0] > 255 || vals[1] > 0xffffff) return null;
    return vals[0] * 2 ** 24 + vals[1];
  }
  if (vals[0] > 0xffffffff) return null;
  return vals[0];
}

const IPV4_BLOCKS: Array<[number, number]> = [
  [0x00000000, 8], // 0.0.0.0/8 ("this network")
  [0x0a000000, 8], // 10/8 RFC1918
  [0x64400000, 10], // 100.64/10 CGNAT
  [0x7f000000, 8], // 127/8 loopback
  [0xa9fe0000, 16], // 169.254/16 link-local (+ cloud metadata)
  [0xac100000, 12], // 172.16/12 RFC1918
  [0xc0000000, 24], // 192.0.0.0/24
  [0xc0000200, 24], // 192.0.2.0/24 TEST-NET-1
  [0xc0586300, 24], // 192.88.99.0/24 (deprecated 6to4 relay)
  [0xc0a80000, 16], // 192.168/16 RFC1918
  [0xc6120000, 15], // 198.18/15 benchmark
  [0xc6336400, 24], // 198.51.100/24 TEST-NET-2
  [0xcb007100, 24], // 203.0.113/24 TEST-NET-3
  [0xe0000000, 4], // 224/4 multicast
  [0xf0000000, 4], // 240/4 reserved
];

export function isPrivateIPv4Number(n: number): boolean {
  for (const [base, prefix] of IPV4_BLOCKS) {
    const block = 2 ** (32 - prefix);
    if (Math.floor(n / block) === Math.floor(base / block)) return true;
  }
  return false;
}

function expandIPv6(address: string): number[] | null {
  let a = address.toLowerCase();
  const v4delim = a.lastIndexOf(":");
  if (a.includes(".") && v4delim >= 0) {
    const v4 = parseIPv4ToNumber(a.substring(v4delim + 1));
    if (v4 === null) return null;
    const high = Math.floor(v4 / 65536);
    const low = v4 % 65536;
    a = `${a.substring(0, v4delim + 1)}${high.toString(16)}:${low.toString(16)}`;
  }
  if (a === "::") return [0, 0, 0, 0, 0, 0, 0, 0];
  if (a.startsWith("::")) a = `0000${a}`;
  if (a.endsWith("::")) a = `${a}0000`;
  const colons = (a.match(/:/g) ?? []).length;
  a = a.replace("::", `:0000`.repeat(8 - colons) + ":");
  const parts = a.split(":");
  if (parts.length !== 8) return null;
  const words: number[] = [];
  for (const p of parts) {
    if (!/^[0-9a-f]{1,4}$/.test(p)) return null;
    words.push(parseInt(p, 16));
  }
  return words;
}

function matchIPv6Prefix(words: number[], prefix: string): boolean {
  const [addr, lenText] = prefix.split("/");
  const len = Number(lenText);
  const pw = expandIPv6(addr);
  if (!pw) return false;
  let rem = len;
  for (let i = 0; i < 8 && rem > 0; i++) {
    if (rem >= 16) {
      if (words[i] !== pw[i]) return false;
      rem -= 16;
    } else {
      const mask = (0xffff << (16 - rem)) & 0xffff;
      if ((words[i] & mask) !== (pw[i] & mask)) return false;
      rem = 0;
    }
  }
  return true;
}

const IPV6_BLOCKS = [
  "::/16", // :: + ::1 (loopback sits inside)
  "2001::/32", // Teredo
  "2002::/16", // 6to4
  "64:ff9b:1::/48", // local-use NAT64
  "fc00::/7", // unique-local
  "fe80::/10", // link-local
  "ff00::/8", // multicast
];

export function isPrivateIPv6(host: string): boolean {
  const words = expandIPv6(host);
  if (!words) return true; // unparseable colon-host: fail closed
  if (IPV6_BLOCKS.some((p) => matchIPv6Prefix(words, p))) return true;
  // IPv4-mapped / NAT64 with an embedded private v4 (e.g. ::ffff:127.0.0.1).
  if (host.includes(".")) {
    const v4part = host.substring(host.lastIndexOf(":") + 1);
    const n = parseIPv4ToNumber(v4part);
    if (n === null || isPrivateIPv4Number(n)) return true;
  }
  return false;
}

const PRIVATE_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home",
  ".corp",
  ".localdomain",
  ".intranet",
  ".private",
];

// Pure syntactic check: true = must not federate with this host (no DNS).
export function isBlockedHostSyntax(hostportOrHost: string): boolean {
  if (allowPrivate()) return false;
  const split = splitHostPort(hostportOrHost.trim());
  if (!split || !split.host) return true;
  const host = normalizeHost(split.host);
  if (!host || host.length > 253) return true;
  if (/[\s/?#@]/.test(host)) return true;

  if (host === "localhost") return true;
  if (PRIVATE_SUFFIXES.some((s) => host === s.slice(1) || host.endsWith(s))) return true;

  // IPv6 literal (contains a colon).
  if (host.includes(":")) return isPrivateIPv6(host) ? true : isIP(host) !== 6;

  // IPv4 literal, including decimal/octal/hex spellings.
  const v4 = parseIPv4ToNumber(host);
  if (v4 !== null) return isPrivateIPv4Number(v4);
  // Numeric-looking but unparseable (e.g. 999.1.1.1, 09.0.0.1): fail closed —
  // it may be an IP encoding this parser does not cover.
  if (/^[0-9xX.]+$/.test(host)) return true;

  // Single-label hosts never identify a public fediverse instance; in compose
  // they are docker service names (postgres, redis, backend) that resolve to
  // private IPs. Block without burning a DNS lookup.
  if (!host.includes(".")) return true;

  return false;
}

// True when the handle must not trigger outbound federation (bad shape or a
// syntactically-blocked host). Pure — safe to call before any I/O.
export function isBlockedHandle(handle: string): boolean {
  if (allowPrivate()) return false;
  const host = extractHandleHost(handle);
  if (host === null) return true;
  // Re-append nothing: extractHandleHost already stripped the port, but the
  // syntax check accepts either form.
  return isBlockedHostSyntax(host);
}

async function resolveHostIPs(host: string): Promise<string[]> {
  const recs = await lookup(host, { all: true });
  return recs.map((r) => r.address);
}

// Full check: syntax + DNS (every A/AAAA must be public). Fail closed — DNS
// errors, empty answers, and unparseable addresses all deny.
export async function isHostAllowed(hostportOrHost: string): Promise<boolean> {
  if (allowPrivate()) return true;
  if (isBlockedHostSyntax(hostportOrHost)) return false;
  const split = splitHostPort(hostportOrHost.trim());
  if (!split) return false;
  const host = normalizeHost(split.host);
  // Literal IPs were fully decided by the syntax layer (public → allow).
  if (parseIPv4ToNumber(host) !== null) return true;
  if (host.includes(":")) return isIP(host) === 6;
  let ips: string[];
  try {
    ips = await resolveHostIPs(host);
  } catch {
    return false;
  }
  if (ips.length === 0) return false;
  for (const ip of ips) {
    const fam = isIP(ip);
    if (fam === 4) {
      const n = parseIPv4ToNumber(ip);
      if (n === null || isPrivateIPv4Number(n)) return false;
    } else if (fam === 6) {
      if (isPrivateIPv6(ip)) return false;
    } else {
      return false;
    }
  }
  return true;
}

export async function isHandleAllowed(handle: string): Promise<boolean> {
  if (allowPrivate()) return true;
  const host = extractHandleHost(handle);
  if (host === null) return false;
  return await isHostAllowed(host);
}
