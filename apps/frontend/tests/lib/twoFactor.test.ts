// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { backupCodeInput, totpDigits, totpKey, totpQrSvg, twoFactorError } from "#lib/twoFactor.js";

const URI =
  "otpauth://totp/Omicron:ada%40x.test?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Omicron&digits=6&period=30";

test("the key is the URI's secret, grouped in fours for typing", () => {
  expect(totpKey(URI)).toBe("JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP");
  expect(totpKey("not a uri")).toBe("");
});

test("the QR code is an SVG, dark on light whatever the theme", () => {
  const svg = totpQrSvg(URI);
  expect(svg).toMatch(/^<svg/);
  expect(svg).toContain("#ffffff");
  expect(svg).toContain("#000000");
});

test("a typed code keeps six digits; a backup code keeps letters, digits and dashes", () => {
  expect(totpDigits(" 12-34 567")).toBe("123456");
  expect(backupCodeInput(" abCDe-12 345!")).toBe("abCDe-12345");
});

test.for([
  ["INVALID_CODE", /code didn't work/],
  ["INVALID_BACKUP_CODE", /already used/],
  ["ACCOUNT_TEMPORARILY_LOCKED", /Too many wrong codes/],
  ["INVALID_TWO_FACTOR_COOKIE", /took too long/],
  ["BACKUP_CODES_NOT_FOR_STAFF", /Ask an admin/],
] as const)("explains %s", ([code, words]) => {
  expect(twoFactorError({ code })).toMatch(words);
});

test("anything else shows the server's words, or a fallback", () => {
  expect(twoFactorError({ code: "OTHER", message: "Nope" })).toBe("Nope");
  expect(twoFactorError(null)).toBe("Something went wrong. Try again.");
});
