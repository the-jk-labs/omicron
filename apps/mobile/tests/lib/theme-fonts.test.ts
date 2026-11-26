import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { expect, test } from "vitest";
import FONT_FILES from "@/lib/theme/fonts.json" with { type: "json" };

const css = readFileSync(new URL("../../src/global.css", import.meta.url), "utf8");

// Android loads each font file under its basename; a mismatch silently falls back to the system sans.
test("every font family in global.css is bundled in fonts.json", () => {
  const bundled = new Set(FONT_FILES.map((file) => basename(file, ".ttf")));
  const declared = [...css.matchAll(/--font-[a-z-]+:\s*"([^"]+)"/g)].map((match) => match[1]);
  expect(declared.length).toBeGreaterThan(0);
  for (const family of declared) expect(bundled).toContain(family);
});
