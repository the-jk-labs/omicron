// SPDX-License-Identifier: AGPL-3.0-or-later
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { isPublicAddress, publicAddressLookup } from "@/lib/publicAddress.ts";

const TIMEOUT_MS = 10_000;

export function generateSigningSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `whsec_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** `X-Omicron-Signature`: an HMAC-SHA256 of `<unix seconds>.<body>`, so a captured message can't be replayed later. */
export async function signatureHeader(secret: string, timestamp: number, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`));
  const hex = Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${timestamp},v1=${hex}`;
}

/**
 * Validates a callback, or returns null. It must share an origin with one of the
 * app's approved redirect URIs, so an app can only ever point events at itself.
 */
export function webhookTarget(input: string, redirectUris: string[], allowPrivate: boolean): URL | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (input.length > 2048 || url.username || url.password || url.hash) return null;
  if (!redirectUris.some((uri) => URL.canParse(uri) && new URL(uri).origin === url.origin)) return null;
  if (allowPrivate) return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  // A literal IP never reaches the DNS lookup that checks addresses, so check it here.
  if (url.protocol !== "https:" || url.port || (isIP(host) && !isPublicAddress(host))) return null;
  return url;
}

/** POSTs once and returns the status. Redirects are not followed: they could lead anywhere. */
export function postWebhook(
  url: URL,
  body: string,
  headers: Record<string, string>,
  allowPrivate: boolean,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = url.protocol === "http:" ? httpRequest : httpsRequest;
    const req = request(
      url,
      {
        method: "POST",
        agent: false,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        ...(allowPrivate ? {} : { lookup: publicAddressLookup }),
        headers: {
          "content-type": "application/json",
          "content-length": String(new TextEncoder().encode(body).length),
          "user-agent": "Omicron-Webhooks",
          ...headers,
        },
      },
      (res) => {
        resolve(res.statusCode ?? 0);
        res.destroy();
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}
