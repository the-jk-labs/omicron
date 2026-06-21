import { endpoints } from "$lib/api";
import type { PageServerLoad } from "./$types";

// Home: preload the default tab — "For you" when signed in, otherwise "Global".
// The other tabs (Local / Global / For you) load lazily on first open.
export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { user } = await parent();
  const api = endpoints(fetch);
  const page = user ? await api.feed() : await api.globalTimeline();
  return { page, personalized: !!user };
};
