// SPDX-License-Identifier: AGPL-3.0-or-later
// Vitest stand-in for SvelteKit's virtual `$env/dynamic/private`. Mutable, so a
// test can point the API proxy at a backend before importing it.
export const env: Record<string, string | undefined> = {
  INTERNAL_API_URL: "http://backend.test:8000",
};
