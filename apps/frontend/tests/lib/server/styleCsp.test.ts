// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import { AVATAR_SIZES } from "#lib/avatarSizes.js";
import { STATIC_STYLE_ATTRIBUTES, STYLE_ATTRIBUTE_HASHES } from "#lib/server/styleCsp.js";

const hash = (value: string) => `sha256-${createHash("sha256").update(value).digest("base64")}`;

test("only reviewed static declarations receive style-attribute hashes", () => {
  expect(new Set(STATIC_STYLE_ATTRIBUTES).size).toBe(STATIC_STYLE_ATTRIBUTES.length);
  expect(STYLE_ATTRIBUTE_HASHES).toEqual(STATIC_STYLE_ATTRIBUTES.map(hash));
  expect(STYLE_ATTRIBUTE_HASHES.length).toBeLessThan(20);
  for (const style of [
    "position:fixed;inset:0;background:red",
    "display: none; background: red",
    "background:url(https://tracker.example/pixel)",
  ]) {
    expect(STYLE_ATTRIBUTE_HASHES).not.toContain(hash(style));
  }
});

// SvelteKit's route announcer visually hides itself with a style attribute; blocked, it shows the page title.
test("SvelteKit's own root component styles are allowed", async () => {
  const kit = dirname(createRequire(import.meta.url).resolve("@sveltejs/kit/package.json"));
  const root = await readFile(join(kit, "src/runtime/components/root.svelte"), "utf8");
  const styles = [...root.matchAll(/\bstyle="([^"{]*)"/g)].map((m) => m[1]);
  expect(styles.length).toBeGreaterThan(0);
  for (const style of styles) expect(STYLE_ATTRIBUTE_HASHES).toContain(hash(style));
});

test("every supported avatar size is covered without authorizing arbitrary dimensions", () => {
  for (const size of AVATAR_SIZES) {
    expect(STYLE_ATTRIBUTE_HASHES).toContain(
      hash(`width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px`),
    );
  }
  expect(STYLE_ATTRIBUTE_HASHES).not.toContain(hash("width:9999px;height:9999px;font-size:3600px"));
});
