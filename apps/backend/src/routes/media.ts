// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { config } from "@/config.ts";
import { notFound } from "@/lib/http.ts";
import { requireUser } from "@/routes/middleware.ts";
import type { AppEnv } from "@/routes/types.ts";
import * as mediaService from "@/services/media.ts";
import * as shareImageService from "@/services/shareImage.ts";

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

// The JPEG share image for an upload (see lib/shareImage.ts for why one
// exists at all). Registered before "/:file" so "og" isn't captured as a
// filename. Public and unauthenticated by necessity — the caller is a link
// preview scraper, which has no session and follows no login.
mediaRoutes.get("/og/:file", async (c) => {
  const file = c.req.param("file");
  // The share URL is always `<uuid>.jpg`; the stored source may be any format.
  const id = /^([a-zA-Z0-9-]+)\.jpg$/.exec(file)?.[1];
  if (!id) throw notFound("File not found.");

  let jpeg: Uint8Array | null;
  try {
    jpeg = await shareImageService.shareJpeg(id);
  } catch (err) {
    // A share image is a nicety; an image the encoder chokes on must not be a
    // 500 in a scraper's face. Log it and let the platform fall back to the
    // instance's brand image.
    console.warn(`Share image failed for ${id}: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
    throw notFound("File not found.");
  }
  if (!jpeg) throw notFound("File not found.");

  // A Uint8Array is a valid runtime BodyInit; the DOM typing (this project
  // compiles with `lib: dom`) omits it — same cast as the inbox in app.ts.
  return new Response(jpeg as BodyInit, {
    headers: {
      "content-type": "image/jpeg",
      // Derived from an immutable upload, so it can be cached as hard as one.
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
});

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
        // Never let the browser re-interpret a stored file as anything other
        // than its declared image type (defence in depth alongside upload-time
        // magic-byte validation).
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    throw notFound("File not found.");
  }
});
