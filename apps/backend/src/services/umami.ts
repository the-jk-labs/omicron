// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import { badRequest } from "@/lib/http.ts";

const KEY = "analytics.umami";
const configSchema = z.object({ enabled: z.boolean(), websiteId: z.union([z.uuid(), z.literal("")]) });
export type UmamiSettings = z.infer<typeof configSchema>;

export async function getSettings(): Promise<UmamiSettings> {
  const parsed = configSchema.safeParse(await settingsRepo.get(KEY));
  return parsed.success ? parsed.data : { enabled: false, websiteId: "" };
}

export async function websiteId(): Promise<string | null> {
  const settings = await getSettings();
  return settings.enabled && settings.websiteId ? settings.websiteId : null;
}

export async function setSettings(input: UmamiSettings): Promise<UmamiSettings> {
  let id = input.websiteId.trim();
  if (/^<script\b/i.test(id)) {
    // Extract only the identifier; pasted HTML and upstream URLs are never stored or executed.
    const matches = [...id.matchAll(/\bdata-website-id\s*=\s*(["'])([^"']+)\1/gi)];
    id = matches.length === 1 ? matches[0][2] : "invalid";
  }
  if ((id && !z.uuid().safeParse(id).success) || (input.enabled && !id)) {
    throw badRequest("Enter a valid Umami website ID or tracking code.");
  }
  const settings = { enabled: input.enabled, websiteId: id.toLowerCase() };
  await settingsRepo.set(KEY, settings);
  return settings;
}

const TIMEOUT_MS = 5_000;
const SCRIPT_TTL_MS = 60 * 60_000;
let scriptCache: { body: string; expiresAt: number } | null = null;
let scriptPending: Promise<string> | null = null;

export async function trackerScript(): Promise<string> {
  if (scriptCache && scriptCache.expiresAt > Date.now()) return scriptCache.body;
  if (scriptPending) return scriptPending;
  scriptPending = (async () => {
    const response = await fetch("https://cloud.umami.is/script.js", {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("javascript")) {
      throw new Error("Umami tracker unavailable.");
    }
    const body = await response.text();
    scriptCache = { body, expiresAt: Date.now() + SCRIPT_TTL_MS };
    return body;
  })();
  try {
    return await scriptPending;
  } finally {
    scriptPending = null;
  }
}

// Only public reading routes, never authentication, editing, search or private lists.
export function publicPath(path: string): boolean {
  return (
    /^\/(?:about|contact|privacy|status)?$/.test(path) || /^\/(?:@[^/?#]+(?:\/[^/?#]+)?|tags\/[^/?#]+)$/.test(path)
  );
}

const pageviewSchema = z
  .object({
    type: z.literal("event"),
    payload: z
      .object({
        website: z.uuid(),
        hostname: z.string().min(1).max(253),
        screen: z.string().max(50),
        language: z.string().max(50),
        title: z.string().max(500),
        url: z.string().min(1).max(2048),
        referrer: z.string().max(2048).optional(),
      })
      .strict(),
  })
  .strict();

export function pageview(body: unknown, id: string) {
  const parsed = pageviewSchema.safeParse(body);
  if (!parsed.success || parsed.data.payload.website !== id) throw badRequest("Invalid pageview.");
  const payload = parsed.data.payload;
  let url: URL;
  try {
    url = new URL(payload.url, `https://${payload.hostname}`);
  } catch {
    throw badRequest("Invalid pageview URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.hostname !== payload.hostname || !publicPath(url.pathname)) {
    throw badRequest("Invalid pageview URL.");
  }
  // The server repeats the browser's filtering so callers cannot forward tokens or custom identities.
  payload.url = url.pathname;
  if (!payload.referrer) {
    payload.referrer = "";
    return parsed.data;
  }
  try {
    const referrer = new URL(payload.referrer, url.origin);
    payload.referrer =
      referrer.origin === url.origin
        ? publicPath(referrer.pathname)
          ? referrer.pathname
          : ""
        : ["http:", "https:"].includes(referrer.protocol)
          ? referrer.origin
          : "";
  } catch {
    payload.referrer = "";
  }
  return parsed.data;
}

export async function sendPageview(
  body: ReturnType<typeof pageview>,
  visitor: { userAgent: string; ip: string; cache?: string },
) {
  const headers = new Headers({
    "content-type": "application/json",
    "user-agent": visitor.userAgent,
    "x-umami-website-id": body.payload.website,
    "x-umami-hostname": body.payload.hostname,
  });
  if (visitor.ip !== "unknown") headers.set("x-forwarded-for", visitor.ip);
  if (visitor.cache) headers.set("x-umami-cache", visitor.cache);
  const response = await fetch("https://gateway.umami.is/api/send", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "error",
  });
  if (!response.ok) throw new Error("Umami collection unavailable.");
  return await response.json();
}
