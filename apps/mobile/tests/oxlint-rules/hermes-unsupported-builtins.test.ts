import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import * as z from "zod/mini";
import { UNSUPPORTED_GLOBALS, UNSUPPORTED_METHODS, UNSUPPORTED_STATICS } from "../../oxlint-rules/index.mjs";

// Checks every entry of local/no-hermes-unsupported against the Hermes source RN ships; a failure means Hermes
// gained support and the entry can be removed. Sources are downloaded once per Hermes version and cached.

const RN = join(process.cwd(), "node_modules/react-native");
const CACHE = join(process.cwd(), "node_modules/.cache/hermes-source");

// RN 0.86 defaults to Hermes V1 unless the Android build opts out.
const gradleProperties = join(process.cwd(), "android/gradle.properties");
const usesLegacyHermes =
  existsSync(gradleProperties) && /^hermesV1Enabled\s*=\s*false/m.test(readFileSync(gradleProperties, "utf8"));
const tag = readFileSync(join(RN, "sdks", usesLegacyHermes ? ".hermesversion" : ".hermesv1version"), "utf8").trim();

const PREDEFINED_STRINGS = "include/hermes/VM/PredefinedStrings.def";
const METHOD_FILES = ["lib/VM/JSLib/Array.cpp", "lib/VM/JSLib/TypedArray.cpp"];
const STATIC_OWNER_FILES: Record<string, string> = {
  Object: "lib/VM/JSLib/Object.cpp",
  Map: "lib/VM/JSLib/Map.cpp",
  Array: "lib/VM/JSLib/Array.cpp",
};

async function cached(key: string, url: string) {
  const file = join(CACHE, tag, key);
  if (existsSync(file)) return readFile(file, "utf8");

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download Hermes source ${url} (HTTP ${response.status})`);
  const text = await response.text();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
  return text;
}

const hermesFile = (path: string) =>
  cached(path, `https://raw.githubusercontent.com/facebook/hermes/${tag}/${path}`).then((text) => ({ path, text }));

// Hermes implements some builtins (e.g. Promise) in JS; any of those files could gain a new method.
async function internalJavaScript() {
  const listing = await cached(
    "InternalJavaScript.json",
    `https://api.github.com/repos/facebook/hermes/contents/lib/InternalJavaScript?ref=${tag}`,
  );
  const entries = z.array(z.object({ path: z.string() })).parse(JSON.parse(listing));
  return Promise.all(entries.filter((entry) => entry.path.endsWith(".js")).map((entry) => hermesFile(entry.path)));
}

function rnPolyfilledGlobals() {
  const globals = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".js")) {
        for (const match of readFileSync(path, "utf8").matchAll(/polyfillGlobal\(\s*['"](\w+)['"]/g))
          globals.add(match[1]);
      }
    }
  };
  walk(join(RN, "Libraries"));
  return globals;
}

type Source = { path: string; text: string };
let sources: Record<string, Source>;
let internalJs: Source[];
let polyfilled: Set<string>;

const word = (name: string) => new RegExp(`\\b${name}\\b`);
const predefined = (name: string) => new RegExp(`Predefined::${name}\\b`);

// Returns one actionable line per file that implements the feature; empty means still unsupported.
const supportFound = (files: Source[], pattern: RegExp, feature: string, list: string) =>
  files
    .filter(({ text }) => pattern.test(text))
    .map(({ path }) => `${feature} is in ${path} (${tag}); remove it from ${list} in oxlint-rules/index.mjs`);

beforeAll(async () => {
  const paths = [PREDEFINED_STRINGS, ...METHOD_FILES, ...Object.values(STATIC_OWNER_FILES)];
  const files = await Promise.all([...new Set(paths)].map(hermesFile));
  sources = Object.fromEntries(files.map((file) => [file.path, file]));
  internalJs = await internalJavaScript();
  polyfilled = rnPolyfilledGlobals();
}, 60_000);

describe(`Hermes builtins (${tag})`, () => {
  test.each(Object.keys(UNSUPPORTED_METHODS))("has no .%s()", (name) => {
    const feature = `.${name}()`;
    const methodFiles = METHOD_FILES.map((path) => sources[path]);
    expect([
      ...supportFound(methodFiles, predefined(name), feature, "UNSUPPORTED_METHODS"),
      ...supportFound(internalJs, word(name), feature, "UNSUPPORTED_METHODS"),
    ]).toEqual([]);
  });

  const statics = Object.entries(UNSUPPORTED_STATICS).flatMap(([owner, names]) =>
    Object.keys(names).map((name) => [owner, name] as const),
  );
  test.each(statics)("has no %s.%s", (owner, name) => {
    // A new owner needs the Hermes file that defines it added to STATIC_OWNER_FILES.
    expect(Object.keys(STATIC_OWNER_FILES)).toContain(owner);
    const feature = `${owner}.${name}`;
    expect([
      ...supportFound([sources[STATIC_OWNER_FILES[owner]]], predefined(name), feature, "UNSUPPORTED_STATICS"),
      ...supportFound(internalJs, word(name), feature, "UNSUPPORTED_STATICS"),
    ]).toEqual([]);
  });

  test.each(Object.keys(UNSUPPORTED_GLOBALS))("has no global %s", (name) => {
    // Every native global is registered by name in PredefinedStrings.def.
    expect(supportFound([sources[PREDEFINED_STRINGS]], word(name), name, "UNSUPPORTED_GLOBALS")).toEqual([]);
    expect([...polyfilled]).not.toContain(name);
  });

  // Guards against Hermes moving files around, which would make the checks above pass vacuously.
  test("detects builtins Hermes does implement", () => {
    expect(sources["lib/VM/JSLib/Array.cpp"].text).toMatch(predefined("toReversed"));
    expect(sources["lib/VM/JSLib/Object.cpp"].text).toMatch(predefined("fromEntries"));
    expect(sources["lib/VM/JSLib/Map.cpp"].text).toMatch(predefined("Map"));
    expect(sources[PREDEFINED_STRINGS].text).toMatch(word("WeakRef"));
    expect(internalJs.some(({ text }) => word("withResolvers").test(text))).toBe(true);
    expect(polyfilled.has("fetch")).toBe(true);
  });
});
