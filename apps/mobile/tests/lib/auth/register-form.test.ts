import { describe, expect, test } from "vitest";
import { describeUserAgent, emailChangeError, needsPassword } from "@/lib/auth/account";
import { isUnverifiedError, parseLoginId } from "@/lib/auth/login";
import { validateRegisterForm, type RegisterForm } from "@/lib/auth/register-form";

const VALID: RegisterForm = {
  username: "ada",
  email: "ada@example.com",
  displayName: "Ada",
  password: "Unique-test-password-123!",
  confirmPassword: "Unique-test-password-123!",
  acceptTerms: true,
};

describe("validateRegisterForm", () => {
  test("a valid form has no errors", () => {
    expect(validateRegisterForm(VALID, false)).toEqual({});
  });

  test.each<[Partial<RegisterForm>, keyof RegisterForm, string]>([
    [{ username: "" }, "username", "Choose a username."],
    [{ username: "ab" }, "username", "3–30 characters: lowercase letters, numbers, underscore."],
    [{ username: "ada lovelace" }, "username", "3–30 characters: lowercase letters, numbers, underscore."],
    [{ email: "" }, "email", "Enter your email address."],
    [{ email: "ada@" }, "email", "Enter a valid email address."],
    [{ displayName: "x".repeat(61) }, "displayName", "Display name must be at most 60 characters."],
    [{ password: "", confirmPassword: "" }, "password", "Password is required (at least 12 characters)."],
    [{ password: "short", confirmPassword: "short" }, "password", "Password must be at least 12 characters."],
    [{ confirmPassword: "different-password" }, "confirmPassword", "Passwords do not match."],
    [{ acceptTerms: false }, "acceptTerms", "You must accept the Terms and Privacy Policy."],
  ])("%j → %s", (patch, field, message) => {
    expect(validateRegisterForm({ ...VALID, ...patch }, null)[field]).toBe(message);
  });

  test("a breached password and a taken email are reported", () => {
    const errors = validateRegisterForm(VALID, true, "ada@example.com");
    expect(errors.password).toMatch(/data breach/);
    expect(errors.email).toMatch(/already registered/);
  });
});

describe("sign-in helpers", () => {
  test("a leading @ means a username; anything with @ left is an email", () => {
    expect(parseLoginId("@ada")).toEqual({ kind: "username", value: "ada" });
    expect(parseLoginId(" ada ")).toEqual({ kind: "username", value: "ada" });
    expect(parseLoginId("Ada@Example.com")).toEqual({ kind: "email", value: "ada@example.com" });
  });

  test("unverified sign-in is recognised by code or message", () => {
    expect(isUnverifiedError({ code: "EMAIL_NOT_VERIFIED" })).toBe(true);
    expect(isUnverifiedError({ message: "Please verify your email" })).toBe(true);
    expect(isUnverifiedError({ code: "INVALID_USERNAME_OR_PASSWORD", message: "Invalid password" })).toBe(false);
  });

  test("email change errors read like the web's", () => {
    expect(emailChangeError({ code: "INVALID_OTP" })).toBe("That code isn't right. Check it and try again.");
    expect(emailChangeError({ code: "SOMETHING", message: "Boom" })).toBe("Boom");
    expect(needsPassword({ code: "PASSWORD_REQUIRED" })).toBe(true);
    expect(needsPassword({ code: "INVALID_OTP" })).toBe(false);
  });

  test.each([
    ["Mozilla/5.0 (Linux; Android 15) AppleWebKit Chrome/130 Mobile Safari", "Chrome on Android"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/605", "Safari on iOS"],
    ["Mozilla/5.0 (Windows NT 10.0; rv:131.0) Gecko Firefox/131.0", "Firefox on Windows"],
    ["okhttp/4.12.0", "Omicron app"],
    [null, "Unknown device"],
  ])("describes %s", (ua, label) => {
    expect(describeUserAgent(ua)).toBe(label);
  });
});
