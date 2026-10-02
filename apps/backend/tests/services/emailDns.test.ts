// SPDX-License-Identifier: AGPL-3.0-or-later
// DNS answers are scripted (node:dns/promises is the network boundary). The
// port-25 probe makes a real TCP connection: `connect` is a pass-through that
// sends port 25 to a local listener, since binding 25 itself needs privileges.
import { createServer, type NetConnectOpts, type Server } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

const target = vi.hoisted(() => ({ port: 0, host: "127.0.0.1" }));

vi.mock(import("node:dns/promises"), () => ({
  resolveMx: vi.fn<(host: string) => Promise<{ exchange: string; priority: number }[]>>(),
  resolveTxt: vi.fn<(host: string) => Promise<string[][]>>(),
}));
vi.mock(import("node:net"), async (importOriginal) => {
  const net = await importOriginal();
  return {
    ...net,
    connect: ((opts: NetConnectOpts & { port?: number }) =>
      net.connect(opts.port === 25 ? { host: target.host, port: target.port } : opts)) as typeof net.connect,
  };
});

import { resolveMx, resolveTxt } from "node:dns/promises";
import { checkOutboundPort25, verifyRecords } from "@/services/emailDns.ts";

let server: Server;
let dns: Record<string, string[][]>;
let mx: Record<string, { exchange: string; priority: number }[]>;

beforeAll(async () => {
  server = createServer((s) => {
    // The probe hangs up immediately; a reset on this side is expected.
    s.on("error", () => {});
    s.end("220 test\r\n");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  target.port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
});

beforeEach(() => {
  dns = {};
  mx = {};
  target.host = "127.0.0.1";
  vi.mocked(resolveTxt).mockImplementation(async (host) => {
    if (!(host in dns)) throw Object.assign(new Error(`queryTxt ENOTFOUND ${host}`), { code: "ENOTFOUND" });
    return dns[host];
  });
  vi.mocked(resolveMx).mockImplementation(async (host) => {
    if (!(host in mx)) throw Object.assign(new Error(`queryMx ENOTFOUND ${host}`), { code: "ENOTFOUND" });
    return mx[host];
  });
});

describe("verifyRecords", () => {
  test("a fully published domain is healthy", async () => {
    dns["mail.example"] = [["v=spf1 a mx ~all"], ["google-site-verification=x"]];
    // TXT records may be split into several strings; they are joined.
    dns["omicron._domainkey.mail.example"] = [["v=DKIM1; k=rsa; ", "p=PUB", "KEY"]];
    dns["_dmarc.mail.example"] = [["v=DMARC1; p=none"]];
    mx["mail.example"] = [
      { priority: 20, exchange: "mx2.mail.example" },
      { priority: 10, exchange: "mx1.mail.example" },
    ];
    const r = await verifyRecords("mail.example", "omicron", "PUBKEY");
    expect(r.healthy).toBe(true);
    expect(r.spf).toEqual({
      host: "mail.example",
      expected: "a TXT record starting with v=spf1",
      found: ["v=spf1 a mx ~all"],
      ok: true,
    });
    expect(r.dkim.ok).toBe(true);
    expect(r.dmarc.ok).toBe(true);
    expect(r.mx.found).toEqual(["mx1.mail.example", "mx2.mail.example"]);
  });

  test("nothing published is unhealthy, and lookup errors read as empty", async () => {
    const r = await verifyRecords("mail.example", "omicron", "PUBKEY");
    expect(r.healthy).toBe(false);
    for (const check of [r.spf, r.dkim, r.dmarc, r.mx]) {
      expect(check.ok).toBe(false);
      expect(check.found).toEqual([]);
    }
  });

  test("a stale DKIM key from an earlier keypair is not healthy", async () => {
    dns["mail.example"] = [["v=spf1 ~all"]];
    dns["omicron._domainkey.mail.example"] = [["v=DKIM1; k=rsa; p=OLDKEY"]];
    const r = await verifyRecords("mail.example", "omicron", "NEWKEY");
    expect(r.dkim.ok).toBe(false);
    expect(r.healthy).toBe(false);
  });

  test("DKIM matching ignores whitespace inside the published key; SPF is case-insensitive", async () => {
    dns["mail.example"] = [["V=SPF1 -all"]];
    dns["omicron._domainkey.mail.example"] = [["v=DKIM1; k=rsa; p=AB CD\n EF"]];
    const r = await verifyRecords("mail.example", "omicron", "ABC DEF");
    expect(r.spf.ok).toBe(true);
    expect(r.dkim.ok).toBe(true);
  });

  test("DMARC and MX are advisory: SPF + DKIM alone are healthy", async () => {
    dns["mail.example"] = [["v=spf1 a ~all"]];
    dns["omicron._domainkey.mail.example"] = [["v=DKIM1; p=K"]];
    expect((await verifyRecords("mail.example", "omicron", "K")).healthy).toBe(true);
  });
});

describe("checkOutboundPort25", () => {
  test("connects to the best Gmail MX and reports success", async () => {
    mx["gmail.com"] = [
      { priority: 30, exchange: "alt.gmail.example" },
      { priority: 5, exchange: "primary.gmail.example" },
    ];
    expect(await checkOutboundPort25()).toEqual({
      ok: true,
      detail: "Connected to primary.gmail.example:25. Outbound SMTP works from this host.",
    });
  });

  test("falls back to a known host when the MX lookup fails", async () => {
    const r = await checkOutboundPort25();
    expect(r).toMatchObject({ ok: true });
    expect(r.detail).toContain("gmail-smtp-in.l.google.com:25");
  });

  test("a refused connection explains the likely port-25 block", async () => {
    const closed = createServer();
    await new Promise<void>((r) => closed.listen(0, "127.0.0.1", r));
    const deadPort = (closed.address() as { port: number }).port;
    await new Promise((r) => closed.close(r));
    const saved = target.port;
    target.port = deadPort;
    const r = await checkOutboundPort25();
    target.port = saved;
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("ECONNREFUSED");
    expect(r.detail).toContain("blocks outbound port 25");
  });

  test("gives up after six seconds", async () => {
    // A non-routable address never answers the SYN.
    target.host = "10.255.255.1";
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = checkOutboundPort25();
    await vi.advanceTimersByTimeAsync(6_000);
    const r = await pending;
    vi.useRealTimers();
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("timed out");
  });
});
