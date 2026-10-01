// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Vitest stand-in for SvelteKit's virtual `$app/environment` module. `browser`
// is `false` (server-like) so anything gated on it — e.g. writing the timezone
// cookie — stays inert during a render.
export const browser = false;
export const building = false;
export const dev = true;
export const version = "test";
