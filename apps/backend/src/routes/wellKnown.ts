// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { escapeHtml } from "@/lib/html.ts";
import { getOrigin } from "@/services/instanceSetup.ts";
import { nodeInfo20 } from "@/services/nodeInfo.ts";

// Discovery documents an instance is expected to answer on, beyond what Fedify
// registers for us. Mounted only when federation is running (see app.ts): each
// one describes a fediverse node, and answering as one while federation is off
// would be a claim about this instance that isn't true.
//
// These are the addresses a directory or a remote server hits *before* it knows
// anything about us, so each must answer 200 with the right Content-Type on a
// plain unauthenticated GET. Anything else and the instance is simply not there
// as far as the fediverse is concerned.
export const wellKnownRoutes = new Hono();

// NodeInfo's entry point: a JRD listing where the real documents live.
//
// This shadows Fedify's own handler for the path, deliberately, and is why it is
// mounted ahead of the federation middleware. Fedify emits a link for 2.1 alone
// — it has room for exactly the one dispatcher — and this instance publishes 2.0
// as well (see services/nodeInfo.ts for why), so the entry point has to list
// both or the second document is unreachable by the crawlers that need it.
const NODEINFO_TYPE = (version: string) =>
  `application/json; profile="http://nodeinfo.diaspora.software/ns/schema/${version}#"`;

wellKnownRoutes.get("/.well-known/nodeinfo", async (c) => {
  const origin = await getOrigin();
  return c.json(
    {
      links: ["2.0", "2.1"].map((version) => ({
        rel: `http://nodeinfo.diaspora.software/ns/schema/${version}`,
        href: `${origin}/nodeinfo/${version}`,
        type: NODEINFO_TYPE(version),
      })),
    },
    200,
    { "content-type": "application/jrd+json" },
  );
});

// The 2.0 document. Its 2.1 twin is Fedify's, from the dispatcher in
// federation/nodeinfo.ts, and both render the same numbers from the same query.
wellKnownRoutes.get("/nodeinfo/2.0", async (c) =>
  c.json(await nodeInfo20(), 200, { "content-type": NODEINFO_TYPE("2.0") }),
);

// host-meta: the pre-WebFinger discovery step from RFC 6415, which hands a
// client the WebFinger URL template rather than making it assume the well-known
// path. Most modern software goes straight to /.well-known/webfinger, but the
// older and more conservative half of the network — and several instance
// directories — still ask for this first and give up when it 404s.
//
// The template is built on the instance's canonical origin rather than the host
// this request arrived on, so an alias hostname (`www.`) hands out the one
// address the instance actually federates under.
function webFingerTemplate(origin: string): string {
  return `${origin}/.well-known/webfinger?resource={uri}`;
}

wellKnownRoutes.get("/.well-known/host-meta", async (c) => {
  // The domain is operator-set (the wizard), so it is escaped before going
  // into an XML attribute. `{uri}` survives untouched — escapeHtml leaves
  // braces alone — which it must, being the spec's own placeholder.
  const template = escapeHtml(webFingerTemplate(await getOrigin()));
  // XRD, the XML form, is what the spec defines and what every client that
  // bothers with host-meta at all requests. `{uri}` is the spec's own
  // placeholder and must survive unescaped.
  const xrd = `<?xml version="1.0" encoding="UTF-8"?>
<XRD xmlns="http://docs.oasis-open.org/ns/xri/xrd-1.0">
  <Link rel="lrdd" type="application/jrd+json" template="${template}"/>
</XRD>
`;
  return c.body(xrd, 200, { "content-type": "application/xrd+xml; charset=utf-8" });
});

// The JSON spelling of the same document, for clients that ask for it by name.
wellKnownRoutes.get("/.well-known/host-meta.json", async (c) =>
  c.json(
    {
      links: [
        {
          rel: "lrdd",
          type: "application/jrd+json",
          template: webFingerTemplate(await getOrigin()),
        },
      ],
    },
    200,
    { "content-type": "application/jrd+json" },
  ),
);
