// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test, vi } from "vitest";
vi.mock("@/lib/publicImage.ts", async (original) => ({
  ...(await original()),
  fetchPublicImage: vi.fn<typeof fetchPublicImage>(),
}));
import { fetchPublicImage } from "@/lib/publicImage.ts";

beforeEach(() => vi.resetModules());

test("caches bounded images and coalesces concurrent requests for the same URL", async () => {
  const image = { bytes: new Uint8Array([1, 2]), contentType: "image/png" };
  vi.mocked(fetchPublicImage).mockResolvedValue(image);
  const { proxyImage } = await import("@/services/imageProxy.ts");
  await expect(
    Promise.all([proxyImage("https://images.example/a"), proxyImage("https://images.example/a")]),
  ).resolves.toEqual([image, image]);
  expect(await proxyImage("https://images.example/a")).toEqual(image);
  expect(fetchPublicImage).toHaveBeenCalledTimes(1);
});

test("fetch failures are not cached and upstream details are not disclosed", async () => {
  vi.mocked(fetchPublicImage).mockRejectedValue(new Error("private upstream detail"));
  const { proxyImage } = await import("@/services/imageProxy.ts");
  await expect(proxyImage("https://images.example/a")).rejects.toMatchObject({
    status: 404,
    message: "Image unavailable.",
  });
  await expect(proxyImage("https://images.example/a")).rejects.toMatchObject({ status: 404 });
  expect(fetchPublicImage).toHaveBeenCalledTimes(2);
});

test("limits parallel outbound work per origin and globally, releasing slots on failure", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(fetchPublicImage).mockReturnValue(
    new Promise((_resolve, fail) => {
      reject = fail;
    }),
  );
  const { proxyImage } = await import("@/services/imageProxy.ts");
  const requests = [proxyImage("https://images0.example/0"), proxyImage("https://images0.example/1")];
  await expect(proxyImage("https://images0.example/another")).rejects.toMatchObject({ status: 429 });
  for (let i = 2; i < 8; i++) requests.push(proxyImage(`https://images${Math.floor(i / 2)}.example/${i}`));
  const settled = Promise.allSettled(requests);
  await expect(proxyImage("https://other.example/a")).rejects.toMatchObject({ status: 429 });
  reject(new Error("timeout"));
  await settled;
  vi.mocked(fetchPublicImage).mockResolvedValue({ bytes: new Uint8Array([1]), contentType: "image/png" });
  await expect(proxyImage("https://other.example/a")).resolves.toHaveProperty("contentType", "image/png");
});

test("invalid targets do not consume an outbound slot", async () => {
  const { proxyImage } = await import("@/services/imageProxy.ts");
  await expect(proxyImage("https://127.0.0.1/private")).rejects.toMatchObject({ status: 400 });
  expect(fetchPublicImage).not.toHaveBeenCalled();
});

test("cached images expire and the byte budget evicts older entries", async () => {
  const image = { bytes: new Uint8Array(5 * 1024 * 1024), contentType: "image/png" };
  vi.mocked(fetchPublicImage).mockResolvedValue(image);
  const { proxyImage } = await import("@/services/imageProxy.ts");
  for (let i = 0; i < 4; i++) await proxyImage(`https://images.example/${i}`);
  expect(fetchPublicImage).toHaveBeenCalledTimes(4);
  await proxyImage("https://images.example/0");
  expect(fetchPublicImage).toHaveBeenCalledTimes(5);
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 3_600_001);
  await proxyImage("https://images.example/0");
  expect(fetchPublicImage).toHaveBeenCalledTimes(6);
});
