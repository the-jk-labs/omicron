// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { GET } from "../../../../src/routes/.well-known/security.txt/+server";

test("publishes the project's security contact and a future RFC 9116 expiry", async () => {
  const response = await GET({});
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  const text = await response.text();
  expect(text).toContain("Contact: mailto:subhanqedirli@protonmail.com\n");
  const expiry = new Date(/^Expires: (.+)$/m.exec(text)![1]).getTime();
  expect(expiry).toBeGreaterThan(Date.now());
  expect(expiry).toBeLessThan(Date.now() + 365 * 24 * 60 * 60 * 1000);
});
