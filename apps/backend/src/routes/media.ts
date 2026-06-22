// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { config } from "@/config.ts";
import { notFound } from "@/lib/http.ts";
import type { AppEnv } from "@/routes/types.ts";

// Serves user-uploaded media (avatars) from local disk. Mounted at /api/uploads
// so it flows through the same SvelteKit → backend proxy as the JSON API.
export const mediaRoutes = new Hono<AppEnv>();

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