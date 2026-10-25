// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { hasScope, parseScopes, scopesInclude } from "@/services/oauthScopes.ts";

test("hierarchical permissions never imply administration or a parent permission", () => {
  expect(hasScope("read write", "read:posts")).toBe(true);
  expect(hasScope("write", "write:accounts")).toBe(true);
  expect(hasScope("read write", "admin:write")).toBe(false);
  expect(hasScope("read:accounts", "read")).toBe(false);
  expect(hasScope("read:accounts", "read:profile")).toBe(false);
  expect(scopesInclude("read write", "read:posts write:lists")).toBe(true);
  expect(scopesInclude("read:posts", "read write")).toBe(false);
});

test("canonical scopes are ordered and invalid or ambiguous values are refused", () => {
  expect(parseScopes("write read")).toBe("read write");
  for (const value of [
    null,
    [],
    "",
    " read",
    "read  write",
    "read read",
    "read\nwrite",
    "push",
    "admin",
    "write:unknown",
  ]) {
    expect(() => parseScopes(value)).toThrow(/scope/i);
  }
});
