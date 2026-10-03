// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { emailChangeError, needsPassword } from "#lib/emailChange.js";

test.each([
  [{ code: "INVALID_OTP" }, "That code isn't right. Check it and try again."],
  [{ code: "OTP_EXPIRED" }, "That code has expired. Send a new one."],
  [{ code: "TOO_MANY_ATTEMPTS" }, "Too many wrong tries. Send a new code."],
  [{ message: "This email is already in use." }, "This email is already in use."],
  [null, "Something went wrong. Try again."],
])("%o reads as plain English", (error, text) => {
  expect(emailChangeError(error)).toBe(text);
});

test("a too-old session asks for the password again", () => {
  expect(needsPassword({ code: "PASSWORD_REQUIRED" })).toBe(true);
  expect(needsPassword({ code: "INVALID_OTP" })).toBe(false);
});
