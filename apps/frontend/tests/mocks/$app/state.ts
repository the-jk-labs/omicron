// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Vitest stand-in for SvelteKit's virtual `$app/state` module. Component tests
// run outside a SvelteKit server, so the real module never exists; this keeps
// `import { page } from "$app/state"` resolvable with a minimal, sensible shape.
//
// A plain object is enough for render-only assertions (components read
// `page.data.*` once). Tests that need to flip state between renders should
// reset `page.data` directly before rendering.
export const page = {
  data: { user: null },
  url: new URL("http://localhost/"),
  params: {},
  route: { id: null },
  status: 200,
  error: null,
};

export const navigating = null;
export const updated = { current: false };
