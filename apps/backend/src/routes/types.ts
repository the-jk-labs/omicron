import type { User } from "@/db/schema.ts";

// Shared Hono environment: `user` is populated by the session middleware.
export type AppEnv = {
  Variables: {
    user: User | null;
  };
};
