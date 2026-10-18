// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { renderAccessRules, testAccessRules, type AccessRule } from "@/services/accessRules.ts";

const now = Date.parse("2026-10-18T12:00:00Z");
const rule: AccessRule = {
  id: "block",
  network: "192.0.2.0/24",
  action: "block",
  reason: "Test",
  enabled: true,
  createdAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 3600000).toISOString(),
};
const caddyfile = readFileSync(new URL("../../../../Caddyfile", import.meta.url), "utf8");

test("first active match wins, including an explicit allow exception", () => {
  expect(testAccessRules([rule], "192.0.2.1", "/search", now)).toMatchObject({ action: "block", ruleId: "block" });
  expect(testAccessRules([{ ...rule, id: "allow", action: "allow" }, rule], "192.0.2.1", "/search", now)).toMatchObject(
    { action: "allow", ruleId: "allow" },
  );
  expect(testAccessRules([rule], "198.51.100.1", "/search", now).action).toBe("default");
});

test("disabled and expired rules do not match, including the exact expiry instant", () => {
  expect(testAccessRules([{ ...rule, enabled: false }], "192.0.2.1", "/", now).action).toBe("default");
  expect(testAccessRules([rule], "192.0.2.1", "/", Date.parse(rule.expiresAt)).action).toBe("default");
});

test.each([
  "/api",
  "/api/posts",
  "/admin",
  "/ADMIN/security",
  "/login",
  "/_app/immutable/a.js",
  "/.within.website/test",
  "/.well-known/webfinger",
  "/inbox",
  "/users/ada",
  "/nodeinfo/2.1",
  "/robots.txt",
  "/@ada/feed.xml",
  "/sitemap/posts-1.xml",
  "/indexnow-ab12.txt",
  "/%61dmin",
  "/x/../admin",
  "/admin//security",
])("keeps %s reachable under a global block", (path) => {
  expect(testAccessRules([{ ...rule, network: "0.0.0.0/0" }], "192.0.2.1", path, now).action).toBe("exempt");
});

test.each(["https://example.com", "//example.com/admin", "/?query", "/#fragment", "/%zz"])(
  "rejects ambiguous preview paths: %s",
  (path) => expect(() => testAccessRules([], "192.0.2.1", path, now)).toThrow(/path/),
);

test("generates literal ordered routes with request-time expiry and unspoofable peer IPs", () => {
  const rendered = renderAccessRules(caddyfile, [rule, { ...rule, id: "allow", action: "allow" }]);
  expect(rendered).toContain("remote_ip('192.0.2.0/24') && int({time.now.unix_ms}) < 1792328400000");
  expect(rendered).not.toContain("X-Forwarded-For'");
  expect(rendered.indexOf("route @access_pages")).toBeLessThan(rendered.indexOf("respond @access_0"));
  expect(rendered).toContain("@access_pages expression `!(path(");
  expect(rendered).not.toContain("reverse_proxy @access_exempt");
  expect(rendered.indexOf("respond @access_0")).toBeLessThan(rendered.indexOf("reverse_proxy @access_1"));
  expect(rendered).toContain("reverse_proxy frontend:3000");
  expect(rendered).toContain("handle @federation");
  expect(rendered).toContain("path_regexp('^/indexnow-[0-9a-fA-F]+[.]txt$')");
  expect(rendered.match(/reverse_proxy frontend:3000/g)).toHaveLength(1);
});

test("only the managed marker changes, and ambiguous templates or invalid stored networks are rejected", () => {
  expect(renderAccessRules(caddyfile, [])).toBe(caddyfile);
  expect(() => renderAccessRules("handle {}", [rule])).toThrow(/exactly once/);
  expect(() => renderAccessRules(`${caddyfile}\n# managed-access-rules`, [rule])).toThrow(/exactly once/);
  expect(() => renderAccessRules(caddyfile, [{ ...rule, network: "bad\nrespond 200" }])).toThrow(/valid IPv4 or IPv6/);
  expect(renderAccessRules(caddyfile, [{ ...rule, enabled: false }])).toBe(caddyfile);
});
