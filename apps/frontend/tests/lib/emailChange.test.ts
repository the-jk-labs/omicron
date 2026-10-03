// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, vi } from "vitest";
import { emailChangeError, needsPassword, rememberNewLogin } from "#lib/emailChange.js";

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

class FakeCredential {
  constructor(public data: object) {}
}

test("the browser's password manager is told about the new login where it can be", async () => {
  const store = vi.fn<(c: unknown) => Promise<void>>().mockResolvedValue();
  vi.stubGlobal("PasswordCredential", FakeCredential);
  vi.stubGlobal("navigator", { credentials: { store } });
  await rememberNewLogin("new@x.test", "pw", "Ada");
  expect(store).toHaveBeenCalledWith(
    expect.objectContaining({ data: { id: "new@x.test", password: "pw", name: "Ada" } }),
  );
});

test("browsers without the API, or that refuse, are skipped quietly", async () => {
  vi.stubGlobal("PasswordCredential", undefined);
  await expect(rememberNewLogin("new@x.test", "pw", "Ada")).resolves.toBeUndefined();

  vi.stubGlobal("PasswordCredential", FakeCredential);
  vi.stubGlobal("navigator", { credentials: { store: () => Promise.reject(new Error("NotAllowedError")) } });
  await expect(rememberNewLogin("new@x.test", "pw", "Ada")).resolves.toBeUndefined();
});
