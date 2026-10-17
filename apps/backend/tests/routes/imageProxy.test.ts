// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { expect, test, vi } from "vitest";
import { handleError } from "@/lib/http.ts";
import { imageProxyRoutes } from "@/routes/imageProxy.ts";
import { proxyImage } from "@/services/imageProxy.ts";

vi.mock("@/services/imageProxy.ts", () => ({ proxyImage: vi.fn<typeof proxyImage>() }));

test("returns only image bytes and instance-owned headers, never upstream credentials", async () => {
  vi.mocked(proxyImage).mockResolvedValue({ bytes: new Uint8Array([1, 2]), contentType: "image/png" });
  const app = new Hono().onError(handleError).route("/api/media", imageProxyRoutes);
  const response = await app.request("/api/media/proxy?url=https%3A%2F%2Fimages.example%2Fa", {
    headers: { cookie: "session=visitor", referer: "https://blog.example/private" },
  });
  expect(response.status).toBe(200);
  expect(proxyImage).toHaveBeenCalledExactlyOnceWith("https://images.example/a");
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
  expect(response.headers.has("set-cookie")).toBe(false);
  expect(response.headers.has("access-control-allow-origin")).toBe(false);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2]));
});
