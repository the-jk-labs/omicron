// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { oauthReturnTo } from "#lib/oauth.js";

test("login resumes only the exact local OAuth authorization page", () => {
  const target = "/oauth/authorize?client_id=client&state=a%2B%2F%3D";
  expect(oauthReturnTo(target)).toBe(target);
});
test.for([
  null,
  "",
  "https://evil.example/",
  "//evil.example/",
  "/\\evil.example",
  "/oauth/authorize/../evil?x=1",
  "/oauth/authorize?x=1\n",
  "/settings",
  "https://local.invalid/oauth/authorize?x=1",
  "/oauth/authorize.evil?x=1",
])("rejects unsafe return target %o", (target) => {
  expect(oauthReturnTo(target)).toBe("/");
});
