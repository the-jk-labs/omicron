// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import { canonicalOrigin, instanceDomain, isNonCanonicalHost } from "#lib/canonical.js";
import { fakeFetch } from "../fakeFetch";

describe("canonicalOrigin", () => {
  test.for([
    ["blog.example", "https://blog.example"],
    ["  blog.example  ", "https://blog.example"],
    ["https://blog.example/", "https://blog.example"],
    ["HTTP://blog.example//", "https://blog.example"],
    ["localhost:5173", "http://localhost:5173"],
    ["blog.example:8443", "https://blog.example:8443"],
  ])("%s → %s", ([domain, origin]) => {
    expect(canonicalOrigin(domain)).toBe(origin);
  });

  test.for([null, undefined, "", "   ", "https://"])("nothing configured (%o) is null", (domain) => {
    expect(canonicalOrigin(domain)).toBe(null);
  });
});

const at = (href: string) => new URL(href);

describe("isNonCanonicalHost", () => {
  test("another hostname for the same instance is non-canonical", () => {
    expect(isNonCanonicalHost(at("https://www.blog.example/x"), "blog.example")).toBe(true);
    expect(isNonCanonicalHost(at("http://203.0.113.5/x"), "blog.example")).toBe(true);
  });

  test("the configured host is canonical, whatever its case or scheme", () => {
    expect(isNonCanonicalHost(at("https://blog.example/x"), "blog.example")).toBe(false);
    expect(isNonCanonicalHost(at("https://blog.example/x"), "Blog.Example")).toBe(false);
    expect(isNonCanonicalHost(at("http://blog.example/x"), "https://blog.example/")).toBe(false);
  });

  test("a port is part of the host", () => {
    expect(isNonCanonicalHost(at("https://blog.example/x"), "blog.example:8443")).toBe(true);
  });

  test("never redirects without a configured domain, or for a localhost instance", () => {
    expect(isNonCanonicalHost(at("https://anything.example/"), null)).toBe(false);
    expect(isNonCanonicalHost(at("http://192.168.1.10:5173/"), "localhost:5173")).toBe(false);
  });
});

test("instanceDomain reads the instance's configured domain", async () => {
  const { fetch } = fakeFetch({ "GET /api/instance": { domain: "blog.example", federationEnabled: true } });
  // The snapshot is cached module-wide; this file only ever asks once.
  expect(await instanceDomain(fetch)).toBe("blog.example");
});
