// SPDX-License-Identifier: AGPL-3.0-or-later
import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/svelte";

// Browser-side Better Auth client. Same-origin: it calls /api/auth/*, which the
// SvelteKit proxy forwards to the backend with cookies intact. The username
// plugin adds signIn.username for the username-or-email login form.
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [usernameClient()],
});
