// SPDX-License-Identifier: AGPL-3.0-or-later

// Mastodon (4.3+) renders an author byline ("More from <author>") on the link
// preview card of a shared article only when TWO things line up:
//   1. the article page carries a `fediverse:creator` meta tag (emitted by the
//      frontend, +layout.svelte), and
//   2. the account it names advertises the article's domain in its actor's
//      `attributionDomains` — the account vouching "this site may attribute
//      posts to me", which stops any site from spoofing a byline.
//
// `attributionDomains` is a Mastodon extension (http://joinmastodon.org/ns#)
// that Fedify's vocab does not model, so we splice it into the served actor
// JSON-LD here. The term mapping and bare-domain value mirror Mastodon's own
// actor output for maximum interop.
const ATTRIBUTION_CONTEXT = {
  toot: "http://joinmastodon.org/ns#",
  attributionDomains: { "@id": "toot:attributionDomains", "@type": "@id" },
};

// Wraps a served actor document, adding `attributionDomains: [domain]`. Returns
// the response untouched if it isn't a JSON-LD Person (e.g. an error, or a
// collection sharing the /users/ prefix), so the caller can apply it blindly.
export async function withAttributionDomains(
  res: Response,
  domain: string,
): Promise<Response> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !contentType.includes("json")) return res;

  let doc: Record<string, unknown>;
  try {
    doc = await res.clone().json();
  } catch {
    return res;
  }
  if (doc.type !== "Person") return res;

  const ctx = doc["@context"];
  doc["@context"] = Array.isArray(ctx)
    ? [...ctx, ATTRIBUTION_CONTEXT]
    : ctx
    ? [ctx, ATTRIBUTION_CONTEXT]
    : [ATTRIBUTION_CONTEXT];
  doc.attributionDomains = [domain];

  const headers = new Headers(res.headers);
  // Body length changed; let the runtime recompute it.
  headers.delete("content-length");
  return new Response(JSON.stringify(doc), {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
