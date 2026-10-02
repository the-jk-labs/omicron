// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import { normalizeLanguage, parseLanguageFilter } from "@/lib/languages.ts";

describe("normalizeLanguage", () => {
  test.for([
    ["en", "en"],
    ["EN", "en"],
    [" en ", "en"],
    ["en-US", "en"],
    ["pt_BR", "pt"],
    ["zh-Hant-TW", "zh"],
    ["fil", "fil"],
    ["AZE", "aze"],
  ])("%j -> %j", ([input, expected]) => {
    expect(normalizeLanguage(input)).toBe(expected);
  });

  test.for(["", " ", "e", "engl", "english", "e1", "12", "-en", "en!", "日本"])("rejects %j", (input) => {
    expect(normalizeLanguage(input)).toBe(null);
  });

  test.for([null, undefined, 42, {}, ["en"], true])("rejects non-string %o", (input) => {
    expect(normalizeLanguage(input)).toBe(null);
  });
});

describe("parseLanguageFilter", () => {
  test("parses show mode", () => {
    expect(parseLanguageFilter("show", "en,az")).toEqual({ mode: "show", langs: ["en", "az"] });
  });

  test("parses hide mode", () => {
    expect(parseLanguageFilter("hide", "de")).toEqual({ mode: "hide", langs: ["de"] });
  });

  test("normalizes and de-duplicates the list, keeping first-seen order", () => {
    expect(parseLanguageFilter("show", "en-US, EN ,pt_BR,pt,az")).toEqual({ mode: "show", langs: ["en", "pt", "az"] });
  });

  test("drops invalid entries", () => {
    expect(parseLanguageFilter("show", "en,,english,1,az")).toEqual({ mode: "show", langs: ["en", "az"] });
  });

  test.for([undefined, "", "SHOW", "only", "include"])("is off for mode %j", (mode) => {
    expect(parseLanguageFilter(mode, "en")).toBe(null);
  });

  test.for([undefined, "", ",", "xx1,english"])("is off when no language survives (%j)", (langs) => {
    expect(parseLanguageFilter("show", langs)).toBe(null);
  });
});
