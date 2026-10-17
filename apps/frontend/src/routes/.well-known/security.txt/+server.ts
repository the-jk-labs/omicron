// SPDX-License-Identifier: AGPL-3.0-or-later
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () => {
  const expires = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
  return new Response(`Contact: mailto:subhanqedirli@protonmail.com\nExpires: ${expires}\nPreferred-Languages: en\n`, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" },
  });
};
