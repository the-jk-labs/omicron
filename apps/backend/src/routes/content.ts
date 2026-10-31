// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { MAX_ARCHIVE_BYTES } from "@/lib/contentArchive.ts";
import { badRequest } from "@/lib/http.ts";
import { rateLimit } from "@/lib/rateLimit.ts";
import type { Reply } from "@/lib/reply.ts";
import { readUpload, requireUser } from "@/routes/middleware.ts";
import type { AppEnv } from "@/routes/types.ts";
import * as portability from "@/services/contentPortability.ts";

export const contentRoutes = new Hono<AppEnv>();
contentRoutes.use("*", async (c, next) => {
  requireUser(c);
  c.header("Cache-Control", "no-store");
  await next();
});
contentRoutes.use(
  "*",
  rateLimit({ name: "content-portability", windowMs: 60_000, max: 6, key: (c) => requireUser(c).id }),
);

contentRoutes.get("/export", async (c) => {
  const bytes = await portability.exportContent(requireUser(c));
  c.header("Content-Type", "application/zip");
  c.header("Content-Disposition", 'attachment; filename="omicron-content.zip"');
  return c.body(new Uint8Array(bytes));
});

contentRoutes.post("/preview", async (c) => {
  const bytes = await readUpload(c, MAX_ARCHIVE_BYTES, "Choose an archive up to 50 MB.");
  return c.json((await portability.preview(requireUser(c).id, bytes)) satisfies Reply<"ContentImportPreview">);
});

contentRoutes.post("/import", async (c) => {
  const mode = c.req.query("preservePublished");
  if (mode !== undefined && mode !== "true" && mode !== "false") throw badRequest("Invalid publication option.");
  const bytes = await readUpload(c, MAX_ARCHIVE_BYTES, "Choose an archive up to 50 MB.");
  return c.json(
    (await portability.importContent(requireUser(c).id, bytes, mode === "true")) satisfies Reply<"ContentImportResult">,
  );
});
