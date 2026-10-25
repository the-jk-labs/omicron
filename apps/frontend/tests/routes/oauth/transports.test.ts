// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, vi } from "vitest";
import { GET, OPTIONS } from "../../../src/routes/.well-known/oauth-authorization-server/+server";
import * as revoke from "../../../src/routes/oauth/revoke/+server";
import * as token from "../../../src/routes/oauth/token/+server";

test("OAuth discovery and transport preflights proxy to the root backend paths", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(new Response(null, { status: 204, headers: { "access-control-allow-origin": "*" } }));
  vi.stubGlobal("fetch", fetch);
  for (const [path, method, handler] of [
    ["/.well-known/oauth-authorization-server", "GET", GET],
    ["/.well-known/oauth-authorization-server", "OPTIONS", OPTIONS],
    ["/oauth/token", "OPTIONS", token.OPTIONS],
    ["/oauth/revoke", "OPTIONS", revoke.OPTIONS],
  ] as const) {
    const url = new URL(`https://blog.example${path}`);
    const result = await handler({
      url,
      request: new Request(url, { method }),
      params: {},
      getClientAddress: () => "198.51.100.1",
    } as never);
    expect(result.status).toBe(204);
    expect(result.headers.get("access-control-allow-origin")).toBe("*");
    expect(fetch).toHaveBeenLastCalledWith(
      `http://backend.test:8000${path}`,
      expect.objectContaining({ method, redirect: "manual" }),
    );
  }
});
