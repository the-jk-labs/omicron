// SPDX-License-Identifier: AGPL-3.0-or-later

// Live DNS verification for a sending domain. The admin page calls this to
// confirm the operator actually published the SPF / DKIM / DMARC records before
// email is declared healthy — the "verify, don't just instruct" half of Path B.

import { dnsRecords } from "@/services/dkim.ts";

export interface DnsCheck {
  host: string;
  ok: boolean;
  /** What we looked for (human-readable). */
  expected: string;
  /** TXT/MX values actually found (for display / debugging). */
  found: string[];
}

export interface DnsReport {
  domain: string;
  mx: DnsCheck;
  spf: DnsCheck;
  dkim: DnsCheck;
  dmarc: DnsCheck;
  /** DKIM + SPF present is the bar for "deliverable"; DMARC/MX are advisory. */
  healthy: boolean;
}

async function txt(host: string): Promise<string[]> {
  try {
    // Each TXT record can be split into multiple strings; join them.
    return (await Deno.resolveDns(host, "TXT")).map((parts) => parts.join(""));
  } catch {
    return [];
  }
}

async function mxHosts(domain: string): Promise<string[]> {
  try {
    return (await Deno.resolveDns(domain, "MX"))
      .sort((a, b) => a.preference - b.preference)
      .map((r) => r.exchange);
  } catch {
    return [];
  }
}

/** Look up and validate the records for `domain` / `selector` / `publicKey`. */
export async function verifyRecords(
  domain: string,
  selector: string,
  publicKey: string,
): Promise<DnsReport> {
  const want = dnsRecords(domain, selector, publicKey);

  const [spfTxt, dkimTxt, dmarcTxt, mx] = await Promise.all([
    txt(want.spf.host),
    txt(want.dkim.host),
    txt(want.dmarc.host),
    mxHosts(domain),
  ]);

  const spfFound = spfTxt.filter((t) => t.toLowerCase().startsWith("v=spf1"));
  const spf: DnsCheck = {
    host: want.spf.host,
    expected: "a TXT record starting with v=spf1",
    found: spfFound,
    ok: spfFound.length > 0,
  };

  // Match on the published public key (ignoring whitespace), so a stale key from
  // a previous keypair doesn't read as healthy.
  const wantKey = publicKey.replace(/\s+/g, "");
  const dkim: DnsCheck = {
    host: want.dkim.host,
    expected: "a DKIM TXT record with this instance's public key",
    found: dkimTxt,
    ok: dkimTxt.some((t) => t.replace(/\s+/g, "").includes(`p=${wantKey}`)),
  };

  const dmarcFound = dmarcTxt.filter((t) => t.toLowerCase().startsWith("v=dmarc1"));
  const dmarc: DnsCheck = {
    host: want.dmarc.host,
    expected: "a TXT record starting with v=DMARC1",
    found: dmarcFound,
    ok: dmarcFound.length > 0,
  };

  const mxCheck: DnsCheck = {
    host: domain,
    expected: "at least one MX record",
    found: mx,
    ok: mx.length > 0,
  };

  return { domain, mx: mxCheck, spf, dkim, dmarc, healthy: spf.ok && dkim.ok };
}

// Preflight for self-hosted `direct` delivery: can this host actually open an
// outbound connection on port 25? Many VPS providers block it, which is the
// silent reason direct sending never delivers — so we test it up front by
// connecting to a well-known MX (Google's) and immediately closing.
export async function checkOutboundPort25(): Promise<{ ok: boolean; detail: string }> {
  let hosts: string[] = [];
  try {
    hosts = (await Deno.resolveDns("gmail.com", "MX"))
      .sort((a, b) => a.preference - b.preference)
      .map((r) => r.exchange);
  } catch { /* fall through to a hardcoded target */ }
  const host = hosts[0] ?? "gmail-smtp-in.l.google.com";

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const conn = await Promise.race([
      Deno.connect({ hostname: host, port: 25 }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timed out")), 6000);
      }),
    ]);
    conn.close();
    return { ok: true, detail: `Connected to ${host}:25 — outbound SMTP works from this host.` };
  } catch (err) {
    return {
      ok: false,
      detail: `Could not reach ${host}:25 (${err instanceof Error ? err.message : err}). ` +
        `Your host most likely blocks outbound port 25 — use the API relay or an SMTP provider instead.`,
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
