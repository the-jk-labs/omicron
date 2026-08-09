// SPDX-License-Identifier: AGPL-3.0-or-later
import { error } from "@sveltejs/kit";
import { endpoints } from "$lib/api";
import type { RequestHandler } from "./$types";

// The IndexNow key file.
//
// When this instance submits a URL, it names this file. The engine fetches it
// and checks the contents match the key that came with the submission — which
// is how it knows the sender controls the domain rather than someone else
// pushing URLs for a site they do not own.
//
// Served from the app origin because that is the host the engines were told
// about, and it must be a plain-text body containing the key and nothing else.
//
// The backend is asked to confirm the key rather than to hand it over, so this
// route never has a copy to leak: a request for the wrong filename learns only
// that it was wrong. 404 when IndexNow is switched off, so a disabled instance
// exposes no key file at all.

export const GET: RequestHandler = async ({ fetch, params }) => {
  const { ok } = await endpoints(fetch).verifyIndexNowKey(params.key).catch(() => ({ ok: false }));
  if (!ok) error(404, "Not found");

  return new Response(`${params.key}\n`, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // The key is stable once minted, but an engine re-checking it after the
      // admin switched IndexNow off must see the 404 rather than a cached copy.
      "cache-control": "public, max-age=300",
    },
  });
};
