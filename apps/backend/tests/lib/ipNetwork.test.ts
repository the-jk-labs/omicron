// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { networkContains, normalizeNetwork, validateAddress } from "@/lib/ipNetwork.ts";

test.each([
  ["192.0.2.129/24", "192.0.2.0/24"],
  ["192.0.2.1", "192.0.2.1/32"],
  ["2001:db8:abcd::1/32", "2001:db8:0:0:0:0:0:0/32"],
  ["::/0", "0:0:0:0:0:0:0:0/0"],
  ["::1", "0:0:0:0:0:0:0:1/128"],
  ["2001:db8::192.0.2.1", "2001:db8:0:0:0:0:c000:201/128"],
])("normalizes %s", (input, expected) => expect(normalizeNetwork(input)).toBe(expected));

test.each([
  "example.com",
  "192.0.2.1/33",
  "::/129",
  "::/-1",
  "::/",
  "::/1/2",
  "192.0.2.1/1e1",
  "fe80::1%eth0",
  "::ffff:192.0.2.1",
  "192.0.2.1\nrespond 200",
])("rejects invalid or ambiguous input %s", (input) => {
  expect(() => normalizeNetwork(input)).toThrow(/valid|CIDR|range|IPv4/);
});

test.each([
  ["192.0.2.0/24", "192.0.2.255", true],
  ["192.0.2.0/24", "192.0.3.0", false],
  ["192.0.2.0/24", "::ffff:192.0.2.10", true],
  ["0.0.0.0/0", "2001:db8::1", false],
  ["2001:db8::/32", "2001:db8:ffff::1", true],
  ["2001:db8::/32", "2001:db9::1", false],
  ["::/0", "::1", true],
  ["::1", "::2", false],
])("matches %s against %s", (network, ip, expected) => expect(networkContains(network, ip)).toBe(expected));

test("visitor addresses cannot contain a CIDR prefix", () =>
  expect(() => validateAddress("192.0.2.1/32")).toThrow(/valid IPv4 or IPv6/));
