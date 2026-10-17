// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from "node:crypto";
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

test("every supported avatar size is covered without authorizing arbitrary dimensions", () => {
  for (const size of AVATAR_SIZES) {
    expect(STYLE_ATTRIBUTE_HASHES).toContain(
      hash(`width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px`),
    );
  }
  expect(STYLE_ATTRIBUTE_HASHES).not.toContain(hash("width:9999px;height:9999px;font-size:3600px"));
});
