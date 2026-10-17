// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { rateLimit } from "@/lib/rateLimit.ts";
import type { AppEnv } from "@/routes/types.ts";
import { proxyImage } from "@/services/imageProxy.ts";

export const imageProxyRoutes = new Hono<AppEnv>();
const limiter = rateLimit({ name: "image-proxy", windowMs: 60_000, max: 240 });

imageProxyRoutes.get("/proxy", limiter, async (c) => {
  const image = await proxyImage(c.req.query("url") ?? "");
  return new Response(image.bytes as BodyInit, {
    headers: {
      "content-type": image.contentType,
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin",
    },
  });
});
