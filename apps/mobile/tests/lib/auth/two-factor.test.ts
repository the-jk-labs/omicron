// oxlint-disable typescript/no-unsafe-type-assertion -- a deliberately partial test double
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { InstanceAuthClient } from "@/lib/auth/auth-client";
import {
  backupCodeInput,
  confirmSetup,
  needsSecondStep,
  startSetup,
  totpDigits,
  totpKey,
  totpQrSvg,
  twoFactorError,
  verifySecondStep,
} from "@/lib/auth/two-factor";

type AuthResult = { data?: unknown; error?: { code?: string; message?: string } | null };

const enable = vi.fn<(body: unknown) => Promise<AuthResult>>();
const verifyTotp = vi.fn<(body: unknown) => Promise<AuthResult>>();
const verifyBackupCode = vi.fn<(body: unknown) => Promise<AuthResult>>();
const auth = { twoFactor: { enable, verifyTotp, verifyBackupCode } } as unknown as InstanceAuthClient;

const URI = "otpauth://totp/Omicron:ada?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Omicron";

beforeEach(() => {
  verifyTotp.mockResolvedValue({ data: {}, error: null });
  verifyBackupCode.mockResolvedValue({ data: {}, error: null });
});

describe("setup helpers", () => {
  test("the key is the URI's secret, grouped in fours for typing", () => {
    expect(totpKey(URI)).toBe("JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP");
    expect(totpKey("otpauth://totp/x")).toBe("");
  });

  test("the QR code is an SVG, dark on light whatever the theme", () => {
    expect(totpQrSvg(URI)).toMatch(/^<svg/);
    expect(totpQrSvg(URI)).toContain("#ffffff");
  });

  test("typed codes keep only what a code can hold", () => {
    expect(totpDigits(" 12-34 567")).toBe("123456");
    expect(backupCodeInput(" abCDe-12 345!")).toBe("abCDe-12345");
  });

  test("errors read the same as on the web", () => {
    expect(twoFactorError({ code: "INVALID_CODE" })).toMatch(/code didn't work/);
    expect(twoFactorError({ code: "BACKUP_CODES_NOT_FOR_STAFF" })).toMatch(/Ask an admin/);
    expect(twoFactorError({ code: "OTHER", message: "Nope" })).toBe("Nope");
  });
});

describe("signing in", () => {
  test("a password that needs a code is told apart from a finished sign-in", () => {
    expect(needsSecondStep({ twoFactorRedirect: true, twoFactorMethods: ["totp"] })).toBe(true);
    expect(needsSecondStep({ token: "t", user: {} })).toBe(false);
    expect(needsSecondStep(null)).toBe(false);
  });

  test("a right code signs in", async () => {
    const signedIn = vi.fn<() => Promise<void>>(async () => {});
    expect(await verifySecondStep(auth, "123456", false, signedIn)).toBe("signed-in");
    expect(verifyTotp).toHaveBeenCalledWith({ code: "123456" });
    expect(signedIn).toHaveBeenCalledOnce();
  });

  test("a backup code goes to its own check", async () => {
    await verifySecondStep(auth, "abcde-12345", true, async () => {});
    expect(verifyBackupCode).toHaveBeenCalledWith({ code: "abcde-12345" });
    expect(verifyTotp).not.toHaveBeenCalled();
  });

  test("a wrong code is explained, and an expired step sends them back to the password", async () => {
    verifyTotp.mockResolvedValue({ error: { code: "INVALID_CODE" } });
    const signedIn = vi.fn<() => Promise<void>>();
    expect(await verifySecondStep(auth, "000000", false, signedIn)).toMatchObject({ expired: false });
    verifyTotp.mockResolvedValue({ error: { code: "INVALID_TWO_FACTOR_COOKIE" } });
    expect(await verifySecondStep(auth, "000000", false, signedIn)).toEqual({
      message: "This sign-in took too long. Enter your password again.",
      expired: true,
    });
    expect(signedIn).not.toHaveBeenCalled();
  });

  test("a network failure is a message, not a crash", async () => {
    verifyTotp.mockRejectedValue(new Error("offline"));
    expect(await verifySecondStep(auth, "123456", false, async () => {})).toEqual({
      message: "offline",
      expired: false,
    });
  });
});

describe("setting it up", () => {
  test("the password unlocks the setup URI and backup codes", async () => {
    enable.mockResolvedValue({ data: { method: "totp", totpURI: URI, backupCodes: ["a-1"] }, error: null });
    expect(await startSetup(auth, "secret")).toEqual({ totpURI: URI, backupCodes: ["a-1"] });
    expect(enable).toHaveBeenCalledWith({ password: "secret" });
  });

  test("a wrong password says so", async () => {
    enable.mockResolvedValue({ error: { code: "INVALID_PASSWORD" } });
    expect(await startSetup(auth, "nope")).toEqual({ message: "That password isn't right." });
  });

  test("the first code from the app turns it on", async () => {
    expect(await confirmSetup(auth, "123456")).toBe(null);
    verifyTotp.mockResolvedValue({ error: { code: "INVALID_CODE" } });
    expect(await confirmSetup(auth, "000000")).toMatch(/code didn't work/);
  });
});
