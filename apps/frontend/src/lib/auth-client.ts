// SPDX-License-Identifier: AGPL-3.0-or-later
import { passkeyClient } from "@better-auth/passkey/client";
import { emailOTPClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/svelte";
import { changesSession, resetPasskeyPrompt } from "#lib/passkeyPrompt.js";

// Browser-side Better Auth client. Same-origin: it calls /api/auth/*, which the
// SvelteKit proxy forwards to the backend with cookies intact. The username
// plugin adds signIn.username for the username-or-email login form; the passkey
// plugin adds signIn.passkey and passkey management; the email-OTP plugin is
// used only to change the login email.
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [usernameClient(), passkeyClient(), emailOTPClient()],
  fetchOptions: {
    onSuccess: ({ request }) => {
      if (changesSession(request.url)) resetPasskeyPrompt();
    },
  },
});
