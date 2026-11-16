// SPDX-License-Identifier: AGPL-3.0-or-later
import { Buffer } from "node:buffer";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { isPublicAddress, publicAddressLookup } from "@/lib/publicAddress.ts";

// GETs a JSON document from a server on the public internet: NodeInfo, the
// FediDB directory, a peer's public API. Every hop's address is checked as the
// socket connects (no second DNS lookup to rebind), redirects are bounded and
// re-checked, and the body is size-capped, so a hostile directory entry can't
// point the instance at its own network or stream it a gigabyte.

export const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export type FetchJson = (url: string, signal: AbortSignal) => Promise<unknown>;

export class PublicJsonError extends Error {}

// `allowPrivate` is for local multi-instance development only (ALLOW_PRIVATE_FEDERATION).
export function jsonTarget(input: string, allowPrivate: boolean): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new PublicJsonError("Invalid URL.");
  }
  if (url.username || url.password) throw new PublicJsonError("Invalid URL.");
  if (allowPrivate) {
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new PublicJsonError("Invalid URL.");
    return url;
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (url.protocol !== "https:" || (isIP(host) && !isPublicAddress(host))) throw new PublicJsonError("Invalid URL.");
  return url;
}

type Hop = { location: string } | { body: string };

function readOnce(url: URL, signal: AbortSignal, userAgent: string, allowPrivate: boolean): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const request = url.protocol === "http:" ? httpRequest : httpsRequest;
    const req = request(
      url,
      {
        method: "GET",
        agent: false,
        signal,
        ...(allowPrivate ? {} : { lookup: publicAddressLookup }),
        headers: {
          accept: "application/json, application/activity+json;q=0.9",
          "accept-encoding": "identity",
          "user-agent": userAgent,
        },
      },
      (res) => {
        res.on("error", reject);
        const status = res.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          const location = res.headers.location;
          res.destroy();
          resolve({ location });
          return;
        }
        if (status !== 200) {
          res.destroy();
          reject(new PublicJsonError(`HTTP ${status}`));
          return;
        }
        if (
          (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity") ||
          Number(res.headers["content-length"]) > MAX_JSON_BYTES
        ) {
          res.destroy();
          reject(new PublicJsonError("Unsupported response."));
          return;
        }
        const chunks: Buffer[] = [];
        let length = 0;
        res.on("data", (chunk: Buffer) => {
          length += chunk.length;
          if (length > MAX_JSON_BYTES) {
            req.destroy(new PublicJsonError("Response too large."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export function publicJsonFetcher(userAgent: string, allowPrivate: boolean): FetchJson {
  return async (input, signal) => {
    let target = jsonTarget(input, allowPrivate);
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      const hop = await readOnce(target, signal, userAgent, allowPrivate);
      if ("location" in hop) {
        target = jsonTarget(new URL(hop.location, target).href, allowPrivate);
        continue;
      }
      try {
        return JSON.parse(hop.body) as unknown;
      } catch {
        throw new PublicJsonError("Response is not JSON.");
      }
    }
    throw new PublicJsonError("Too many redirects.");
  };
}
