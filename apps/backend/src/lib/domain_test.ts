// SPDX-License-Identifier: AGPL-3.0-or-later
import { assertEquals } from "@std/assert";
import { hostMatchesDomain, normalizeDomain } from "@/lib/domain.ts";

// The defederation blocklist is a moderation/safety control. If normalization
// accepts junk or matching misses a subdomain, an admin's block silently fails
// to take effect — so these pin the parsing and the subdomain-match semantics.

Deno.test("normalizeDomain: accepts and lowercases a bare host", () => {
  assertEquals(normalizeDomain("Example.COM"), "example.com");
  assertEquals(normalizeDomain("  fosstodon.org  "), "fosstodon.org");
});

Deno.test("normalizeDomain: extracts host from a full URL", () => {
  assertEquals(normalizeDomain("https://Mastodon.Example.com/@user"), "mastodon.example.com");
  assertEquals(normalizeDomain("http://host.social:443/path"), "host.social");
});

Deno.test("normalizeDomain: extracts host from a handle", () => {
  assertEquals(normalizeDomain("@user@fosstodon.org"), "fosstodon.org");
  assertEquals(normalizeDomain("user@host.social"), "host.social");
});

Deno.test("normalizeDomain: rejects non-hostnames", () => {
  for (const bad of ["", "   ", "not a domain", "localhost", "192.168.0.1", "http://"]) {
    assertEquals(normalizeDomain(bad), null, `${JSON.stringify(bad)} should be null`);
  }
});

Deno.test("hostMatchesDomain: exact host matches", () => {
  assertEquals(hostMatchesDomain("example.com", "example.com"), true);
  assertEquals(hostMatchesDomain("Example.com", "example.com"), true);
});

Deno.test("hostMatchesDomain: subdomains match (block cascades down)", () => {
  assertEquals(hostMatchesDomain("mastodon.example.com", "example.com"), true);
  assertEquals(hostMatchesDomain("a.b.example.com", "example.com"), true);
});

Deno.test("hostMatchesDomain: siblings and look-alikes do NOT match", () => {
  assertEquals(hostMatchesDomain("notexample.com", "example.com"), false);
  assertEquals(hostMatchesDomain("example.com.evil.com", "example.com"), false);
  assertEquals(hostMatchesDomain("example.org", "example.com"), false);
});
