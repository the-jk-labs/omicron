import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

// Writing requires authentication.
export const load: PageServerLoad = async ({ parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, "/login");
  return {};
};
