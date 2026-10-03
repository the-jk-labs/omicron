// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { findLanguage, LANGUAGES, languageLabel } from "#lib/languages.js";

test("codes are unique primary subtags, and the list is alphabetized by English name", () => {
  const codes = LANGUAGES.map((l) => l.code);
  expect(new Set(codes).size).toBe(codes.length);
  for (const code of codes) expect(code).toMatch(/^[a-z]{2,3}$/);
  const names = LANGUAGES.map((l) => l.name);
  expect(names).toEqual(names.toSorted((a, b) => a.localeCompare(b)));
});

test("lookup and labels", () => {
  expect(findLanguage("az")).toEqual({ code: "az", name: "Azerbaijani", native: "Azərbaycan dili" });
  expect(findLanguage("xx")).toBeUndefined();
  expect(findLanguage(null)).toBeUndefined();
  expect(languageLabel("tr")).toBe("Turkish");
  // An unusual federated tag falls back to the raw code.
  expect(languageLabel("tlh")).toBe("TLH");
  expect(languageLabel(undefined)).toBe("");
});
