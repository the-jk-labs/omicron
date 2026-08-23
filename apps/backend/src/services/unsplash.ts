// SPDX-License-Identifier: AGPL-3.0-or-later
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import { badRequest } from "@/lib/http.ts";
import type { StockPhoto } from "@/services/stockPhotos.ts";

// Unsplash — the banner picker's optional second source, alongside the
// always-available Openverse (see services/stockPhotos.ts).
//
// Optional because it cannot be anything else: Unsplash issues a key per
// registered application and has no anonymous mode, so there is no version of
// this that works on a fresh instance. Shipping one shared key would put it in
// a public repository, spend a single quota across every instance in the world,
// and breach the terms it was issued under. So an operator pastes their own key
// in the admin panel, or this provider simply isn't offered.
//
// The key never leaves the server. Searches are proxied through this instance
// rather than called from the browser, which is also what Unsplash's terms
// require (a public key would be anyone's to spend).

const KEYS = {
  accessKey: "media.unsplashAccessKey",
} as const;

const API = "https://api.unsplash.com";
// Unsplash pins its response shape to a dated API version; sending it means a
// later default on their side can't silently change what we parse.
const API_VERSION = "v1";
// A slow third party must not hold an editor request open indefinitely.
const TIMEOUT_MS = 8000;
// One screenful. Unsplash's demo tier allows 50 requests an hour, so the picker
// asks for a usable page rather than paging aggressively.
const PER_PAGE = 24;

/**
 * Attribution query string required by the Unsplash API guidelines: every link
 * back to a photographer or to Unsplash has to identify the referring app.
 */
const UTM = "utm_source=omicron&utm_medium=referral";

export function withUtm(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}${UTM}`;
}

export async function accessKey(): Promise<string | null> {
  const key = await settingsRepo.get<string>(KEYS.accessKey);
  return key?.trim() || null;
}

/** Whether the picker should be offered at all. */
export async function configured(): Promise<boolean> {
  return (await accessKey()) !== null;
}

/**
 * Store or clear the access key. Passing null (or a blank string) removes it,
 * which is how an operator turns the feature back off.
 *
 * Cleared as an empty string rather than a JSON null: `instance_settings.value`
 * is NOT NULL, and every reader here already treats blank as absent — so this
 * keeps the store's invariant instead of loosening a column for one setting.
 */
export function setAccessKey(key: string | null): Promise<void> {
  return settingsRepo.set(KEYS.accessKey, key?.trim() || "");
}

type RawPhoto = {
  id?: unknown;
  alt_description?: unknown;
  description?: unknown;
  urls?: { small?: unknown; regular?: unknown };
  links?: { download_location?: unknown };
  user?: { name?: unknown; username?: unknown; links?: { html?: unknown } };
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

// Skips anything missing a piece we cannot do without: an image to show, a
// photographer to credit, and the download endpoint their terms oblige us to
// call. A partial result is dropped rather than rendered as a photo we would be
// using without attribution.
function toPhoto(raw: RawPhoto): StockPhoto | null {
  const id = str(raw.id);
  const thumbUrl = str(raw.urls?.small);
  const bannerUrl = str(raw.urls?.regular);
  const name = str(raw.user?.name) || str(raw.user?.username);
  const profile = str(raw.user?.links?.html);
  const useToken = str(raw.links?.download_location);
  if (!id || !thumbUrl || !bannerUrl || !name || !profile || !useToken) return null;
  return {
    id,
    alt: str(raw.alt_description) || str(raw.description) || "",
    thumbUrl,
    bannerUrl,
    // No licence: Unsplash serves photos under its own licence rather than a
    // named public one, so there is nothing to link a reader to. Their terms
    // ask for the photographer and Unsplash itself, both with UTM-tagged links.
    credit: {
      name,
      nameUrl: withUtm(profile),
      source: "Unsplash",
      sourceUrl: withUtm(`https://unsplash.com/photos/${id}`),
    },
    useToken,
  };
}

async function call(url: string, key: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: {
        authorization: `Client-ID ${key}`,
        "accept-version": API_VERSION,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Search Unsplash for photos matching `query`.
 *
 * Failures are reported as a 400 the editor can print, never as a 500: an
 * expired key or a rate limit is a condition of the operator's account, not a
 * fault in this instance, and the author needs to be told which.
 */
export async function search(query: string, page = 1): Promise<StockPhoto[]> {
  const key = await accessKey();
  if (!key) throw badRequest("Unsplash search isn't set up on this instance.");

  const params = new URLSearchParams({
    query: query.slice(0, 100),
    page: String(page),
    per_page: String(PER_PAGE),
    // Photos only — an illustration or a vector makes a poor 16:9 banner.
    content_filter: "high",
    orientation: "landscape",
  });

  let res: Response;
  try {
    res = await call(`${API}/search/photos?${params.toString()}`, key);
  } catch {
    throw badRequest("Couldn't reach Unsplash. Try again in a moment.");
  }

  if (res.status === 401) throw badRequest("Unsplash rejected this instance's access key.");
  if (res.status === 403) {
    throw badRequest("This instance has hit its Unsplash rate limit. Try again later.");
  }
  if (!res.ok) throw badRequest("Unsplash search failed. Try again in a moment.");

  const body = (await res.json().catch(() => null)) as { results?: RawPhoto[] } | null;
  return (body?.results ?? []).map(toPhoto).filter((p): p is StockPhoto => p !== null);
}

/**
 * Ping the download endpoint for a photo the author actually chose.
 *
 * Required by the Unsplash API guidelines — it is how a photographer's download
 * count stays truthful, and hotlinking their image without it is a term of use
 * we would be breaking. Best-effort: nothing about saving a post should fail
 * because a third-party counter was unreachable.
 *
 * The URL comes back from the browser, so it is checked against Unsplash's own
 * host before being fetched — otherwise this endpoint would forward an
 * authenticated request anywhere a caller named (an SSRF hole with our key
 * attached).
 */
export async function trackDownload(downloadLocation: string): Promise<void> {
  const key = await accessKey();
  if (!key) return;

  let url: URL;
  try {
    url = new URL(downloadLocation);
  } catch {
    throw badRequest("That isn't an Unsplash download link.");
  }
  if (url.protocol !== "https:" || url.host !== "api.unsplash.com") {
    throw badRequest("That isn't an Unsplash download link.");
  }

  try {
    await call(url.href, key);
  } catch {
    // Deliberately silent: the author's banner is chosen either way.
  }
}
