// SPDX-License-Identifier: AGPL-3.0-or-later
import { error, fail, redirect } from "@sveltejs/kit";
import type { IdentityConsent } from "#lib/oauth.js";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch, url, setHeaders }) => {
  setHeaders({ "cache-control": "no-store", "referrer-policy": "no-referrer" });
  const response = await fetch(`/api/oauth/authorize${url.search}`);
  if (response.status === 401) redirect(303, `/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`);
  if (!response.ok) {
    const body = await response.json();
    error(response.status, body.error_description ?? body.error ?? "Could not prepare authorization.");
  }
  return { consent: (await response.json()) as IdentityConsent };
};

export const actions: Actions = {
  default: async ({ request, fetch }) => {
    const data = await request.formData();
    const response = await fetch("/api/oauth/authorize", {
      method: "POST",
      headers: { "content-type": "application/json", origin: request.headers.get("origin") ?? "" },
      body: JSON.stringify({ ticket: data.get("ticket"), decision: data.get("decision") }),
    });
    const result = await response.json();
    if (!response.ok)
      return fail(response.status, {
        error: result.error_description ?? result.error ?? "Authorization failed. Start again from the application.",
      });
    // The backend binds this destination to the registered callback in the one-use ticket.
    return redirect(303, result.redirect, { external: true });
  },
};
