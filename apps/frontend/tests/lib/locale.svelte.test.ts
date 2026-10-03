// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock(import("$app/env"), () => ({ browser: true, building: false, dev: true, version: "test" }));

import { LOCALE_COOKIE, locale, localeFromAcceptLanguage, rememberLocale, validLocale } from "#lib/locale.svelte.js";

afterEach(() => {
  document.cookie = `${LOCALE_COOKIE}=; max-age=0; path=/`;
});

describe("validLocale", () => {
  test.for([
    ["en-us", "en-US"],
    ["az-Latn-AZ", "az-Latn-AZ"],
    ["tr", "tr"],
  ])("canonicalizes %s → %s", ([raw, canonical]) => {
    expect(validLocale(raw)).toBe(canonical);
  });

  test.for([null, undefined, "", "not a locale!", "*", "en_US_POSIX_x"])("rejects %o", (raw) => {
    expect(validLocale(raw)).toBe(null);
  });
});

describe("localeFromAcceptLanguage", () => {
  test("the highest-weighted valid tag wins; equal weights keep header order", () => {
    expect(localeFromAcceptLanguage("tr;q=0.8, az-AZ, en;q=0.9")).toBe("az-AZ");
    expect(localeFromAcceptLanguage("fr, de")).toBe("fr");
    expect(localeFromAcceptLanguage("*;q=1, de;q=0.5")).toBe("de");
  });

  test("zero-weighted, malformed and unknown tags are skipped", () => {
    expect(localeFromAcceptLanguage("en;q=0, de;q=0.1")).toBe("de");
    expect(localeFromAcceptLanguage("!!!, *")).toBe(null);
    // An unreadable weight is ignored, leaving the default of 1.
    expect(localeFromAcceptLanguage("de;q=0.5, en;q=abc")).toBe("en");
    expect(localeFromAcceptLanguage("")).toBe(null);
    expect(localeFromAcceptLanguage(null)).toBe(null);
  });
});

test("the value falls back to en-US, then follows the browser once remembered", () => {
  expect(locale.current).toBe("en-US");
  vi.spyOn(navigator, "language", "get").mockReturnValue("az-az");
  rememberLocale();
  expect(locale.current).toBe("az-AZ");
  expect(document.cookie).toContain(`${LOCALE_COOKIE}=az-AZ`);
});

test("an invalid browser locale is not remembered", () => {
  vi.spyOn(navigator, "language", "get").mockReturnValue("!!");
  rememberLocale();
  expect(document.cookie).not.toContain(`${LOCALE_COOKIE}=`);
});
