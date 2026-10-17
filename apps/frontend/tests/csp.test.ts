// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const config = readFileSync("vite.config.ts", "utf8");

test("image sources do not allow arbitrary remote hosts or insecure HTTP", () => {
  expect(config).toContain('"img-src": ["self", "data:", "blob:"]');
});

test("style elements require a trusted origin or SvelteKit nonce", () => {
  expect(config).toContain('"style-src": ["self"]');
  expect(config).not.toContain('"unsafe-inline"');
  expect(config).toContain('"style-src-attr": ["unsafe-hashes", ...STYLE_ATTRIBUTE_HASHES]');
});
