import { endpoints } from "$lib/api";
import type { PageServerLoad } from "./$types";

// Home: personalized feed when signed in, otherwise the public global timeline.
export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { user } = await parent();
  const api = endpoints(fetch);
  const page = user ? await api.feed() : await api.globalTimeline();
  return { page, personalized: !!user };
};
