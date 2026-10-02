// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test, vi } from "vitest";

vi.mock(import("@/services/instanceSetup.ts"));
vi.mock(import("@/services/nodeInfo.ts"));

import { wellKnownRoutes } from "@/routes/wellKnown.ts";
import { getOrigin } from "@/services/instanceSetup.ts";
import { nodeInfo20 } from "@/services/nodeInfo.ts";

beforeEach(() => {
  vi.mocked(getOrigin).mockResolvedValue("https://blog.example");
});

test("the NodeInfo entry point links both schema versions", async () => {
  const res = await wellKnownRoutes.request("/.well-known/nodeinfo");
  expect(res.headers.get("content-type")).toBe("application/jrd+json");
  expect(await res.json()).toEqual({
    links: [
      {
        rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
        href: "https://blog.example/nodeinfo/2.0",
        type: 'application/json; profile="http://nodeinfo.diaspora.software/ns/schema/2.0#"',
      },
      {
        rel: "http://nodeinfo.diaspora.software/ns/schema/2.1",
        href: "https://blog.example/nodeinfo/2.1",
        type: 'application/json; profile="http://nodeinfo.diaspora.software/ns/schema/2.1#"',
      },
    ],
  });
});

test("/nodeinfo/2.0 serves the 2.0 document with its profile type", async () => {
  vi.mocked(nodeInfo20).mockResolvedValue({ version: "2.0" });
  const res = await wellKnownRoutes.request("/nodeinfo/2.0");
  expect(res.headers.get("content-type")).toBe(
    'application/json; profile="http://nodeinfo.diaspora.software/ns/schema/2.0#"',
  );
  expect(await res.json()).toEqual({ version: "2.0" });
});

test("host-meta (XRD) points at WebFinger with the template escaped for XML", async () => {
  const res = await wellKnownRoutes.request("/.well-known/host-meta");
  expect(res.headers.get("content-type")).toBe("application/xrd+xml; charset=utf-8");
  const xml = await res.text();
  expect(xml).toContain('<XRD xmlns="http://docs.oasis-open.org/ns/xri/xrd-1.0">');
  expect(xml).toContain('template="https://blog.example/.well-known/webfinger?resource={uri}"');
});

test("an origin with XML specials cannot break out of the attribute", async () => {
  vi.mocked(getOrigin).mockResolvedValue('https://x"/><evil/>');
  const xml = await (await wellKnownRoutes.request("/.well-known/host-meta")).text();
  expect(xml).not.toContain("<evil/>");
  expect(xml).toContain("&quot;");
});

test("host-meta.json carries the same template unescaped", async () => {
  const res = await wellKnownRoutes.request("/.well-known/host-meta.json");
  expect(res.headers.get("content-type")).toBe("application/jrd+json");
  expect(await res.json()).toEqual({
    links: [
      {
        rel: "lrdd",
        type: "application/jrd+json",
        template: "https://blog.example/.well-known/webfinger?resource={uri}",
      },
    ],
  });
});
