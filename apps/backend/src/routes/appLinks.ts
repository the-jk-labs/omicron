// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { config } from "@/config.ts";

// The Digital Asset Links statement that lets the Omicron app open this
// instance's https links and use its passkeys. Android fetches it without
// cookies or redirects, so it must answer 200 JSON on a plain GET.
// Independent of federation, unlike wellKnown.ts.
export const appLinksRoutes = new Hono();

appLinksRoutes.get("/.well-known/assetlinks.json", (c) => {
  const fingerprints = config.ANDROID_APP_CERT_FINGERPRINTS;
  if (fingerprints.length === 0) return c.notFound();
  return c.json([
    {
      relation: ["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"],
      target: {
        namespace: "android_app",
        package_name: config.ANDROID_APP_ID,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]);
});
