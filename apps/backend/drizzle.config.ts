import type { Config } from "drizzle-kit";

// Dev-time config for `deno task db:generate`. The generated SQL in ./drizzle
// is committed and replayed at runtime by src/db/migrate.ts — drizzle-kit is
// NOT needed inside the container.
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: Deno.env.get("DATABASE_URL") ??
      "postgres://omicron:omicron@localhost:5432/omicron",
  },
} satisfies Config;
