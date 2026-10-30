// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test, vi } from "vitest";

const config = vi.hoisted(() => ({
  ANDROID_APP_ID: "blog.omicron.app",
  ANDROID_APP_CERT_FINGERPRINTS: [] as string[],
}));
vi.mock(import("@/config.ts"), () => ({ config }) as never);

import { appLinksRoutes } from "@/routes/appLinks.ts";

const FINGERPRINT = Array.from({ length: 32 }, () => "AB").join(":");

beforeEach(() => {
  config.ANDROID_APP_ID = "blog.omicron.app";
  config.ANDROID_APP_CERT_FINGERPRINTS = [];
});

test("an instance without fingerprints claims no app", async () => {
  const res = await appLinksRoutes.request("/.well-known/assetlinks.json");
  expect(res.status).toBe(404);
});

test("serves the Digital Asset Links statement for the configured app and keys", async () => {
  config.ANDROID_APP_CERT_FINGERPRINTS = [FINGERPRINT];
  const res = await appLinksRoutes.request("/.well-known/assetlinks.json");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toMatch(/^application\/json/);
  expect(await res.json()).toEqual([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: "blog.omicron.app", sha256_cert_fingerprints: [FINGERPRINT] },
    },
  ]);
});

test("names a different package when an instance builds its own app", async () => {
  config.ANDROID_APP_ID = "org.example.blog";
  config.ANDROID_APP_CERT_FINGERPRINTS = [FINGERPRINT];
  const res = await appLinksRoutes.request("/.well-known/assetlinks.json");
  expect(await res.json()).toMatchObject([{ target: { package_name: "org.example.blog" } }]);
});
