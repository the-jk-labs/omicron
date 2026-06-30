// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";

// Centralized, validated environment config. Fail fast on misconfiguration.
const schema = z.object({
  DATABASE_URL: z.string().url(),
  APP_DOMAIN: z.string().min(1),
  FEDERATION_ENABLED: z
    .string()
    .transform((v) => v.toLowerCase() !== "false")
    .default(true),
  SESSION_SECRET: z.string().min(8),
  PORT: z.coerce.number().int().positive().default(8000),
  UPLOADS_DIR: z.string().min(1).default("./uploads"),
});

function load() {
  const parsed = schema.safeParse({
    DATABASE_URL: Deno.env.get("DATABASE_URL"),
    APP_DOMAIN: Deno.env.get("APP_DOMAIN"),
    FEDERATION_ENABLED: Deno.env.get("FEDERATION_ENABLED"),
    SESSION_SECRET: Deno.env.get("SESSION_SECRET"),
    PORT: Deno.env.get("PORT"),
    UPLOADS_DIR: Deno.env.get("UPLOADS_DIR"),
  });

  if (!parsed.success) {
    console.error("❌ Invalid environment configuration:");
    console.error(parsed.error.flatten().fieldErrors);
    Deno.exit(1);
  }
  return parsed.data;
}

export const config = load();

// The instance origin (scheme + domain). https unless a localhost dev domain.
export const origin = `${
  config.APP_DOMAIN.startsWith("localhost") ? "http" : "https"
}://${config.APP_DOMAIN}`;
