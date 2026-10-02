import process from "node:process";
import type { Config } from "drizzle-kit";

// Dev-time config for `pnpm db:generate`. The generated SQL in ./drizzle
// is committed and replayed at runtime by `src/db/migrate.ts` — drizzle-kit is
// NOT needed inside the container.
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://omicron:omicron@localhost:5432/omicron",
  },
} satisfies Config;
