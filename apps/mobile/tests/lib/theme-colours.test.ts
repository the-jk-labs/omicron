import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const css = readFileSync(new URL("../../src/global.css", import.meta.url), "utf8");
const names = (block: string) => [...new Set(block.match(/--color-[a-z0-9-]+(?=:)/g))].toSorted();
// Everything from the start of a block to the next line that closes one at its own indent.
const block = (start: string) => css.slice(css.indexOf(start)).split(/\n\s{0,6}\}\n/)[0];

// oxfmt sorts classes by global.css. Without a colour's name in @theme it sorts `bg-<colour>` as unknown, but
// only until Metro runs and Uniwind registers it, so local and CI order disagree. Keep every colour named.
test("every colour the light and dark schemes set is named in @theme", () => {
  const declared = names(block("@theme {\n  --color-"));
  expect(declared.length).toBeGreaterThan(0);
  expect(names(block("@variant light {"))).toEqual(declared);
  expect(names(block("@variant dark {"))).toEqual(declared);
});
