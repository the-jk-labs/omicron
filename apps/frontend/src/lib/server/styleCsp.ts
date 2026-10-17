// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from "node:crypto";
import { AVATAR_SIZES } from "../avatarSizes.js";

// Fixed application/library declarations only; never hash request or post HTML.
export const STATIC_STYLE_ATTRIBUTES = [
  "display: block;",
  "display: none;",
  "display: none",
  "position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0; transform: translateX(-100%); top: 0; left: 0;",
  "transform: translateY(0px)",
  "width:280px;height:280px",
  "box-shadow:0 0 0 9999px rgba(0,0,0,0.5) inset;border-radius:50%",
  ...AVATAR_SIZES.map((size) => `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px`),
] as const;

export const STYLE_ATTRIBUTE_HASHES = STATIC_STYLE_ATTRIBUTES.map(
  (style) => `sha256-${createHash("sha256").update(style).digest("base64")}` as const,
);
