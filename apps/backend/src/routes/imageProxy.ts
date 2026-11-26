// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { rateLimit } from "@/lib/rateLimit.ts";
import { variantWidth } from "@/lib/resizeImage.ts";
import type { AppEnv } from "@/routes/types.ts";
import { proxyImage } from "@/services/imageProxy.ts";
import { remoteVariant } from "@/services/imageVariants.ts";

export const imageProxyRoutes = new Hono<AppEnv>();
const limiter = rateLimit({ name: "image-proxy", windowMs: 60_000, max: 240 });

imageProxyRoutes.get("/proxy", limiter, async (c) => {
  const url = c.req.query("url") ?? "";
  const image = await proxyImage(url);
  // `?w=` asks for a smaller copy; SVGs, animations and images already that
  // narrow come back as they are.
  const width = variantWidth(c.req.query("w"));
  const out = (width && (await remoteVariant(url, image, width))) || image;
  return new Response(out.bytes as BodyInit, {
    headers: {
      "content-type": out.contentType,
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin",
      // Opened directly, a proxied SVG is a document on the instance's origin: it may not run or load anything.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
});
