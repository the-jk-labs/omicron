// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { federationRunning } from "@/services/federationState.ts";
import { APP_VERSION } from "@/version.ts";

export const healthRoutes = new Hono();

healthRoutes.get("/healthz", (c) => c.json({ status: "ok" }));

healthRoutes.get("/version", (c) =>
  c.json({
    name: "omicron",
    version: APP_VERSION,
    federation: federationRunning(),
  }),
);
