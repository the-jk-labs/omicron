import { expoClient } from "@better-auth/expo/client";
import { emailOTPClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import { appFetch } from "@/lib/user-agent";

/** FNV-1a, so each instance gets its own SecureStore keys (which allow only [A-Za-z0-9._-]). */
export function storageKeyFor(origin: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < origin.length; i++) {
    hash ^= origin.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `omicron_${(hash >>> 0).toString(16)}`;
}

/** Better Auth for one instance. Its session cookie is stored per origin and never sent anywhere else. */
export function createInstanceAuthClient(origin: string) {
  return createAuthClient({
    baseURL: `${origin}/api/auth`,
    fetchOptions: { customFetchImpl: appFetch },
    plugins: [
      expoClient({
        storage: SecureStore,
        storagePrefix: storageKeyFor(origin),
        // The backend's cookie prefix; Better Auth ignores cookies it doesn't recognise.
        cookiePrefix: "omicron",
      }),
      usernameClient(),
      emailOTPClient(),
    ],
  });
}

export type InstanceAuthClient = ReturnType<typeof createInstanceAuthClient>;
