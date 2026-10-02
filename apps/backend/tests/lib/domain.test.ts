// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { hostMatchesDomain, normalizeDomain, sameOrigin } from "@/lib/domain.ts";

// The defederation blocklist is a moderation/safety control. If normalization
// accepts junk or matching misses a subdomain, an admin's block silently fails
// to take effect — so these pin the parsing and the subdomain-match semantics.

test("normalizeDomain: accepts and lowercases a bare host", () => {
  expect(normalizeDomain("Example.COM")).toBe("example.com");
  expect(normalizeDomain("  fosstodon.org  ")).toBe("fosstodon.org");
});

test("normalizeDomain: extracts host from a full URL", () => {
  expect(normalizeDomain("https://Mastodon.Example.com/@user")).toBe("mastodon.example.com");
  expect(normalizeDomain("http://host.social:443/path")).toBe("host.social");
});

test("normalizeDomain: extracts host from a handle", () => {
  expect(normalizeDomain("@user@fosstodon.org")).toBe("fosstodon.org");
  expect(normalizeDomain("user@host.social")).toBe("host.social");
});

test("normalizeDomain: rejects non-hostnames", () => {
  for (const bad of ["", "   ", "not a domain", "localhost", "192.168.0.1", "http://"]) {
    expect(normalizeDomain(bad), `${JSON.stringify(bad)} should be null`).toBe(null);
  }
});

test("hostMatchesDomain: exact host matches", () => {
  expect(hostMatchesDomain("example.com", "example.com")).toBe(true);
  expect(hostMatchesDomain("Example.com", "example.com")).toBe(true);
});

test("hostMatchesDomain: subdomains match (block cascades down)", () => {
  expect(hostMatchesDomain("mastodon.example.com", "example.com")).toBe(true);
  expect(hostMatchesDomain("a.b.example.com", "example.com")).toBe(true);
});

test("hostMatchesDomain: siblings and look-alikes do NOT match", () => {
  expect(hostMatchesDomain("notexample.com", "example.com")).toBe(false);
  expect(hostMatchesDomain("example.com.evil.com", "example.com")).toBe(false);
  expect(hostMatchesDomain("example.org", "example.com")).toBe(false);
});

// sameOrigin gates federated ingest: a post may only be attributed to an actor
// on its own origin. A miss here reopens the cross-origin impersonation hole, so
// pin the accept/reject cases the ingest paths depend on.
test("sameOrigin: identical origin matches", () => {
  expect(sameOrigin(new URL("https://a.example/posts/1"), new URL("https://a.example/users/alice"))).toBe(true);
});

test("sameOrigin: different host is refused (the impersonation case)", () => {
  expect(sameOrigin(new URL("https://evil.example/posts/1"), new URL("https://victim.example/users/x"))).toBe(false);
});

test("sameOrigin: scheme or port differences are a different origin", () => {
  expect(sameOrigin(new URL("http://a.example/1"), new URL("https://a.example/2"))).toBe(false);
  expect(sameOrigin(new URL("https://a.example:8443/1"), new URL("https://a.example/2"))).toBe(false);
});

test("sameOrigin: a null id never matches", () => {
  expect(sameOrigin(null, new URL("https://a.example/2"))).toBe(false);
  expect(sameOrigin(new URL("https://a.example/1"), undefined)).toBe(false);
});
