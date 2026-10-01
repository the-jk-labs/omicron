// SPDX-License-Identifier: AGPL-3.0-or-later
// Pins the SSRF guard behind GHSA-A1: anonymous GET /api/remote/users/:handle
// must never trigger outbound fetches toward loopback, RFC1918, link-local
// (incl. cloud metadata), or other private hosts — no matter the IP spelling.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/config.ts", () => ({
  config: { ALLOW_PRIVATE_FEDERATION: false },
}));

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn<() => Promise<unknown>>(),
}));

import {
  extractHandleHost,
  isBlockedHandle,
  isBlockedHostSyntax,
  isHostAllowed,
  parseIPv4ToNumber,
} from "@/federation/ssrf.ts";

describe("extractHandleHost", () => {
  it("strips a leading @ and any port", () => {
    expect(extractHandleHost("@alice@example.com")).toBe("example.com");
    expect(extractHandleHost("x@127.0.0.1:8000")).toBe("127.0.0.1");
    expect(extractHandleHost("x@[::1]:8000")).toBe("::1");
  });

  it("lowercases and strips a trailing dot", () => {
    expect(extractHandleHost("x@LOCALHOST.")).toBe("localhost");
    expect(extractHandleHost("x@Example.COM.")).toBe("example.com");
  });

  it.each(["alice", "@alice", "a@b@c@d/e", "x@", "@", "x@host/path", "x@host?q=1", ""])(
    "rejects malformed handle %j",
    (bad) => {
      expect(extractHandleHost(bad)).toBe(null);
    },
  );
});

describe("parseIPv4ToNumber", () => {
  it("parses dotted decimal", () => {
    expect(parseIPv4ToNumber("127.0.0.1")).toBe(0x7f000001);
    expect(parseIPv4ToNumber("10.0.0.1")).toBe(0x0a000001);
  });

  it("parses decimal/octal/hex spellings to the same loopback", () => {
    expect(parseIPv4ToNumber("2130706433")).toBe(0x7f000001);
    expect(parseIPv4ToNumber("0x7f.0x0.0x0.0x1")).toBe(0x7f000001);
    expect(parseIPv4ToNumber("0x7f000001")).toBe(0x7f000001);
    expect(parseIPv4ToNumber("0177.0.0.01")).toBe(0x7f000001);
  });

  it("rejects out-of-range octets", () => {
    expect(parseIPv4ToNumber("999.1.1.1")).toBe(null);
    expect(parseIPv4ToNumber("1.2.3.256")).toBe(null);
  });
});

describe("isBlockedHostSyntax", () => {
  it.each([
    "127.0.0.1",
    "127.0.0.1:8000",
    "2130706433",
    "0x7f.0.0.1",
    "0x7f000001",
    "0177.0.0.1",
    "::1",
    "[::1]",
    "[::1]:8000",
  ])("blocks loopback spelling %s", (h) => {
    expect(isBlockedHostSyntax(h)).toBe(true);
  });

  it.each([
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "100.64.0.1",
    "192.0.2.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "::",
    "::ffff:127.0.0.1",
  ])("blocks reserved host %s", (h) => {
    expect(isBlockedHostSyntax(h)).toBe(true);
  });

  it.each([
    "localhost",
    "LOCALHOST",
    "localhost.",
    "foo.localhost",
    "app.local",
    "svc.internal",
    "box.lan",
    "postgres",
    "redis",
    "backend",
  ])("blocks local-only name %s", (h) => {
    expect(isBlockedHostSyntax(h)).toBe(true);
  });

  it("fails closed on numeric-looking garbage", () => {
    expect(isBlockedHostSyntax("999.999.999.999")).toBe(true);
    expect(isBlockedHostSyntax("09.0.0.1")).toBe(true);
  });

  it.each(["example.com", "mastodon.social", "a.b.example.com", "8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "allows public host %s (DNS decides the rest)",
    (h) => {
      expect(isBlockedHostSyntax(h)).toBe(false);
    },
  );
});

describe("isBlockedHandle", () => {
  it.each(["x@127.0.0.1:8000", "x@169.254.169.254", "x@localhost", "x@postgres", "x@[::1]"])(
    "blocks the GHSA PoC handle %s without any I/O",
    (h) => {
      expect(isBlockedHandle(h)).toBe(true);
    },
  );

  it("allows a normal federated handle syntactically", () => {
    expect(isBlockedHandle("alice@mastodon.social")).toBe(false);
  });

  it("blocks malformed handles", () => {
    expect(isBlockedHandle("notahandle")).toBe(true);
  });
});

describe("isHostAllowed (DNS layer)", () => {
  it("denies when every answer is private, allows when all are public", async () => {
    const { lookup } = await import("node:dns/promises");
    const mocked = vi.mocked(lookup);
    mocked.mockReset();
    mocked.mockResolvedValueOnce([{ address: "93.184.215.14", family: 4 }] as never);
    expect(await isHostAllowed("example.com")).toBe(true);
    mocked.mockResolvedValueOnce([
      { address: "93.184.215.14", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ] as never);
    expect(await isHostAllowed("rebind.example.com")).toBe(false);
  });

  it("denies on DNS failure (fail closed)", async () => {
    const { lookup } = await import("node:dns/promises");
    const mocked = vi.mocked(lookup);
    mocked.mockReset();
    mocked.mockRejectedValueOnce(new Error("ENOTFOUND"));
    expect(await isHostAllowed("nxdomain.invalid-test-host")).toBe(false);
  });
});
