// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { config } from "@/config.ts";
import { notFound } from "@/lib/http.ts";
import { requireUser } from "@/routes/middleware.ts";
import * as mediaService from "@/services/media.ts";
import type { AppEnv } from "@/routes/types.ts";

// Serves and accepts user-uploaded media (avatars, post images) on local disk.
// Mounted at /api/uploads so it flows through the same SvelteKit → backend proxy
// as the JSON API.
export const mediaRoutes = new Hono<AppEnv>();

// Upload a post image (raw image body; content-type identifies the format).
// Auth-only; returns the public URL the editor inserts into the document.
mediaRoutes.post("/", async (c) => {
  requireUser(c);
  const contentType = (c.req.header("content-type") ?? "").split(";")[0].trim();
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  const url = await mediaService.saveImage(bytes, contentType);
  return c.json({ url }, 201);
});

const CONTENT_TYPE: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

mediaRoutes.get("/:file", async (c) => {
  const file = c.req.param("file");
  // Reject anything that isn't a plain `<uuid>.<ext>` to prevent path traversal.
  if (!/^[a-zA-Z0-9-]+\.(png|jpe?g|webp|gif)$/.test(file)) throw notFound("File not found.");
  const ext = file.split(".").pop()!.toLowerCase();

  try {
    const bytes = await Deno.readFile(`${config.UPLOADS_DIR}/${file}`);
    return new Response(bytes, {
      headers: {
        "content-type": CONTENT_TYPE[ext] ?? "application/octet-stream",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    throw notFound("File not found.");
  }
});
