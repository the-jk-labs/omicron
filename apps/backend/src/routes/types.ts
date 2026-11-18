// SPDX-License-Identifier: AGPL-3.0-or-later
import type { User } from "@/db/schema.ts";

// Shared Hono environment: `user` is populated by the session middleware.
export type AppEnv = {
  Variables: {
    user: User | null;
    oauthScopes?: string;
    oauthGrant?: { id: string; clientId: string };
    /** A moderator or admin who hasn't set up the two-factor sign-in this instance requires of them. */
    staffTwoFactorMissing?: boolean;
  };
};
