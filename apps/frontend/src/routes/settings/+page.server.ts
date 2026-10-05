// SPDX-License-Identifier: AGPL-3.0-or-later
import { redirect } from "@sveltejs/kit";
import { ApiError, endpoints } from "#lib/api/index.js";
import type { PageServerLoad } from "./$types";

type Api = ReturnType<typeof endpoints>;

// Better Auth lists sessions only to a sign-in from the last day (403 otherwise).
async function sessions(api: Api) {
  try {
    const [items, current] = await Promise.all([api.sessions(), api.currentSession()]);
    return { locked: false as const, sessions: items, currentToken: current?.session.token ?? null };
  } catch (e) {
    return e instanceof ApiError && e.status === 403 ? { locked: true as const } : null;
  }
}

// Settings are personal, so this page requires authentication. Every list on
// the page loads here so it renders with the page; a list that fails is left to
// the browser, which then shows the error.
export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, "/login");
  const api = endpoints(fetch);
  const [passkeys, sessionList, followedTags, muted, blocked, webhookTokens] = await Promise.all([
    api.passkeys().catch(() => null),
    sessions(api),
    api.followedTags().then(
      (r) => r.tags,
      () => null,
    ),
    api.muted().then(
      (r) => r.items,
      () => null,
    ),
    api.blocked().then(
      (r) => r.items,
      () => null,
    ),
    api.webhookTokens().then(
      (r) => r.tokens,
      () => null,
    ),
  ]);
  return { user, passkeys, sessions: sessionList, followedTags, muted, blocked, webhookTokens };
};
