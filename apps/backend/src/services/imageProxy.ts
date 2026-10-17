// SPDX-License-Identifier: AGPL-3.0-or-later
import { badRequest, notFound, tooManyRequests } from "@/lib/http.ts";
import { fetchPublicImage, imageTarget } from "@/lib/publicImage.ts";

type Image = Awaited<ReturnType<typeof fetchPublicImage>>;
const cache = new Map<string, { image: Image; expires: number }>();
const pending = new Map<string, Promise<Image>>();
const origins = new Map<string, number>();
let cacheBytes = 0;

function remember(key: string, image: Image) {
  for (const [url, entry] of cache) {
    if (cacheBytes + image.bytes.byteLength <= 16 * 1024 * 1024 && cache.size < 64 && entry.expires > Date.now()) break;
    cache.delete(url);
    cacheBytes -= entry.image.bytes.byteLength;
  }
  cache.set(key, { image, expires: Date.now() + 60 * 60_000 });
  cacheBytes += image.bytes.byteLength;
}

export async function proxyImage(input: string): Promise<Image> {
  let target: URL;
  try {
    target = imageTarget(input);
  } catch {
    throw badRequest("Invalid image URL.");
  }
  const key = target.href;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.image;
  if (cached) {
    cache.delete(key);
    cacheBytes -= cached.image.bytes.byteLength;
  }
  const running = pending.get(key);
  if (running) return running;
  const active = origins.get(target.origin) ?? 0;
  if (pending.size >= 8 || active >= 2) throw tooManyRequests("Image proxy is busy. Try again later.");
  origins.set(target.origin, active + 1);
  const work = fetchPublicImage(key)
    .then((image) => {
      remember(key, image);
      return image;
    })
    .catch(() => {
      throw notFound("Image unavailable.");
    })
    .finally(() => {
      pending.delete(key);
      const count = (origins.get(target.origin) ?? 1) - 1;
      if (count) origins.set(target.origin, count);
      else origins.delete(target.origin);
    });
  pending.set(key, work);
  return work;
}
