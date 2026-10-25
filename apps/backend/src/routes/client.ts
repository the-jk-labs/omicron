// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { clientOperations } from "@/routes/clientAccess.ts";
import type { AppEnv } from "@/routes/types.ts";
import { metadata, REFRESH_TTL_SECONDS, TOKEN_TTL_SECONDS } from "@/services/oauth.ts";
import { OAUTH_SCOPES } from "@/services/oauthScopes.ts";

export const clientRoutes = new Hono<AppEnv>();
clientRoutes.get("/", async (c) =>
  c.json({
    apiVersion: 1,
    apiBase: "/api",
    authorization: await metadata(),
    accessTokenLifetime: TOKEN_TTL_SECONDS,
    refreshTokenLifetime: REFRESH_TTL_SECONDS,
    scopes: OAUTH_SCOPES,
    operations: clientOperations.filter((operation) => operation.scope !== null),
    accountSecurityUrl: "/settings",
    documentation: "https://docs.omicron.blog/reference/http-api/",
  }),
);
