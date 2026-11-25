// SPDX-License-Identifier: AGPL-3.0-or-later
import { endpoints } from "#lib/api/index.js";
import type { Me } from "#lib/types.js";

// One `/api/me` per request, shared by the root layout and any page load, keyed
// on the request's `locals` so a page needn't `await parent()` (which waits for
// the whole layout) just to learn who is signed in.
const byRequest = new WeakMap<object, Promise<Me | null>>();

export function currentUser(event: { locals: object; fetch: typeof fetch }): Promise<Me | null> {
  let user = byRequest.get(event.locals);
  if (!user) {
    user = endpoints(event.fetch)
      .me()
      .then((r) => r.user)
      .catch(() => null);
    byRequest.set(event.locals, user);
  }
  return user;
}
