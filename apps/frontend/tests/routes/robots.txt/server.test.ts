// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, vi } from "vitest";
import { apiError, type Routes } from "../../fakeFetch";
import { event } from "../event";

// The instance domain is cached module-wide; each test loads a fresh copy.
async function robots(routes: Routes, url = "https://www.blog.example/robots.txt") {
  vi.resetModules();
  const { GET } = await import("../../../src/routes/robots.txt/+server");
  return await (await GET(event({ url, routes }).event)).text();
}

test("indexable: private areas disallowed, media allowed, sitemap on the canonical origin", async () => {
  const body = await robots({
    "GET /api/seo": { indexingEnabled: true },
    "GET /api/instance": { domain: "blog.example" },
  });
  const lines = body.split("\n");
  expect(lines[0]).toBe("User-agent: *");
  for (const path of ["/compose", "/admin", "/settings", "/search", "/api/", "/setup"]) {
    expect(lines).toContain(`Disallow: ${path}`);
  }
  // The media exceptions sit right under the /api/ block they carve out of.
  const api = lines.indexOf("Disallow: /api/");
  expect(lines.slice(api, api + 3)).toEqual(["Disallow: /api/", "Allow: /api/uploads/", "Allow: /api/og/"]);
  expect(body).toContain("Sitemap: https://blog.example/sitemap.xml\n");
});

test("without a configured domain the request's own origin is advertised", async () => {
  const body = await robots({ "GET /api/seo": { indexingEnabled: true }, "GET /api/instance": { domain: null } });
  expect(body).toContain("Sitemap: https://www.blog.example/sitemap.xml");
});

test("indexing off disallows everything", async () => {
  expect(await robots({ "GET /api/seo": { indexingEnabled: false }, "GET /api/instance": {} })).toBe(
    "User-agent: *\nDisallow: /\n",
  );
});

test("an unreachable backend fails open to the default rules", async () => {
  expect(await robots({ "*": apiError(502) })).toContain("Sitemap: https://www.blog.example/sitemap.xml");
});
