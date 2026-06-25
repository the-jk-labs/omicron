// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { APP_VERSION } from "@/version.ts";
import { config } from "@/config.ts";

export const healthRoutes = new Hono();

healthRoutes.get("/healthz", (c) => c.json({ status: "ok" }));

healthRoutes.get("/version", (c) =>
  c.json({
    name: "omicron",
    version: APP_VERSION,
    federation: config.FEDERATION_ENABLED,
  }));
