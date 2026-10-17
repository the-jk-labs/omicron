// SPDX-License-Identifier: AGPL-3.0-or-later
import { Buffer } from "node:buffer";
import { lookup } from "node:dns";
import { request } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { isPrivateIPv4Number, isPrivateIPv6, parseIPv4ToNumber } from "@/federation/ssrf.ts";
import { sniffMatches } from "@/lib/imageSignature.ts";

export const MAX_PROXY_IMAGE_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

export function isPublicImageAddress(address: string): boolean {
  if (isIP(address) === 4) return !isPrivateIPv4Number(parseIPv4ToNumber(address)!);
  if (isIP(address) !== 6) return false;
  const [first, second] = address.toLowerCase().split(":");
  const subnet = parseInt(second || "0", 16);
  // Only global unicast IPv6, excluding documentation and transition ranges.
  return (
    /^[23]/.test(first) &&
    !(first === "2001" && (subnet < 0x200 || subnet === 0xdb8)) &&
    first !== "3fff" &&
    !isPrivateIPv6(address)
  );
}

export function imageTarget(input: string): URL {
  if (input.length > 4096) throw new Error("Invalid image URL.");
  const url = new URL(input);
  if (url.protocol === "http:") url.protocol = "https:";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    (!host.includes(".") && !isIP(host)) ||
    /(?:^|\.)(?:localhost|local|internal|lan|home|corp|localdomain|intranet|private)\.?$/i.test(host) ||
    (isIP(host) && !isPublicImageAddress(host)) ||
    url.pathname === "/api/media/proxy"
  )
    throw new Error("Invalid image URL.");
  url.hash = "";
  return url;
}

// The validated address is handed straight to the socket, with no second lookup.
export const publicImageLookup: LookupFunction = (host, options, callback) => {
  lookup(host, { all: true }, (error, records) => {
    if (error || !records.length || records.some((record) => !isPublicImageAddress(record.address))) {
      callback(new Error("Non-public image host."), "", 0);
    } else if (options.all) {
      callback(null, records);
    } else {
      callback(null, records[0].address, records[0].family);
    }
  });
};

type ImageHop = { location: string } | { bytes: Uint8Array; contentType: string };

function readImage(url: URL, signal: AbortSignal): Promise<ImageHop> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        agent: false,
        lookup: publicImageLookup,
        signal,
        headers: { accept: Object.keys(TYPES).join(", "), "accept-encoding": "identity" },
      },
      (res) => {
        res.on("error", reject);
        if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0) && res.headers.location) {
          const location = res.headers.location;
          res.destroy();
          resolve({ location });
          return;
        }
        const contentType = (res.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
        const ext = TYPES[contentType];
        if (
          res.statusCode !== 200 ||
          !ext ||
          (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity") ||
          Number(res.headers["content-length"]) > MAX_PROXY_IMAGE_BYTES
        ) {
          res.destroy();
          reject(new Error("Unsupported image response."));
          return;
        }
        const chunks: Buffer[] = [];
        let length = 0;
        res.on("data", (chunk: Buffer) => {
          length += chunk.length;
          if (length > MAX_PROXY_IMAGE_BYTES) {
            req.destroy(new Error("Image too large."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          const bytes = Buffer.concat(chunks);
          if (!sniffMatches(bytes, ext)) reject(new Error("Invalid image contents."));
          else resolve({ bytes, contentType });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export async function fetchPublicImage(input: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  let target = imageTarget(input);
  const signal = AbortSignal.timeout(10_000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const result = await readImage(target, signal);
    if (!("location" in result)) return result;
    target = imageTarget(new URL(result.location, target).href);
  }
  throw new Error("Too many image redirects.");
}
