import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const SRC = join(import.meta.dirname, "../../src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("Uniwind classes", () => {
  // `text-[0.9em]` compiles to a font size that reads `--uniwind-em` while also setting it, so resolving the
  // style recurses until the stack overflows: every post with inline code crashed the reader.
  test("no class sizes anything in em", () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/\[[\d.]+em\]/g)].map((match) => `${file}: ${match[0]}`),
    );
    expect(offenders).toEqual([]);
  });
});
