import { endpoints } from "$lib/api";
import type { LayoutServerLoad } from "./$types";

// Resolves the current user once for every page (used by the nav + guards).
export const load: LayoutServerLoad = async ({ fetch }) => {
  try {
    const { user } = await endpoints(fetch).me();
    return { user };
  } catch {
    return { user: null };
  }
};
