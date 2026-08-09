// SPDX-License-Identifier: AGPL-3.0-or-later
import { badRequest } from "@/lib/http.ts";
import type { StockPhoto } from "@/services/stockPhotos.ts";
import { APP_VERSION } from "@/version.ts";

// Openverse (openverse.org, run by WordPress) — the banner picker's default
// photo source, and the reason the picker works on a fresh instance.
//
// It indexes openly-licensed images from Flickr, Wikimedia Commons, museums and
// others, and its API takes anonymous requests: no registration, no key, no
// admin setup. That is the whole reason it is the default. Unsplash has nicer
// photographs but cannot be used without an operator going and getting a key,
// which is exactly the configuration step this feature should not require.
//
// The trade is attribution. Most of what Openverse indexes is Creative Commons
// rather than public domain, so a photo generally has to be credited with its
// creator, its source and its licence — all of which the API returns and all of
// which is stored on the post and rendered under the banner (see lib/cover.ts).

const API = "https://api.openverse.org/v1/images/";
const TIMEOUT_MS = 8000;
// Openverse's hard ceiling for anonymous callers — asking for more is a 401,
// not a truncated page. Still a full grid.
const PER_PAGE = 20;

// Openverse asks anonymous callers to identify themselves so they can tell
// traffic apart and reach an operator whose instance misbehaves.
const USER_AGENT = `Omicron/${APP_VERSION} (+https://github.com/the-jk-labs/omicron)`;

// Only photos a blog can actually use: commercially usable (many instances
// carry ads or sponsorship) and modifiable (a banner is cropped to 16:9 by the
// layout, which is a derivative work). This excludes ND and NC licences, which
// a writer would otherwise be offered and quietly breach by publishing.
const LICENSE_FILTER = "commercial,modification";

/** Human-readable licence name, e.g. "CC BY-SA 2.0" or "Public domain". */
function licenseLabel(code: string, version: string): string {
  const slug = code.toUpperCase();
  // Openverse's two public-domain marks are not "CC …" licences and read
  // wrongly if formatted as one.
  if (slug === "CC0") return version ? `CC0 ${version}` : "CC0";
  if (slug === "PDM") return "Public domain";
  return version ? `CC ${slug} ${version}` : `CC ${slug}`;
}

type RawImage = {
  id?: unknown;
  title?: unknown;
  url?: unknown;
  thumbnail?: unknown;
  foreign_landing_url?: unknown;
  creator?: unknown;
  creator_url?: unknown;
  license?: unknown;
  license_version?: unknown;
  license_url?: unknown;
  source?: unknown;
  provider?: unknown;
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

// A photo is only usable if it can be shown *and* credited. Anything missing a
// piece of its attribution is dropped rather than published under an incomplete
// credit — the licence is the condition of using it at all, so a result we
// cannot attribute is a result we cannot offer.
function toPhoto(raw: RawImage): StockPhoto | null {
  const id = str(raw.id);
  const bannerUrl = str(raw.url);
  const thumbUrl = str(raw.thumbnail) || bannerUrl;
  const name = str(raw.creator);
  const nameUrl = str(raw.creator_url);
  const sourceUrl = str(raw.foreign_landing_url);
  const source = str(raw.source) || str(raw.provider);
  const license = str(raw.license);
  const licenseUrl = str(raw.license_url);
  if (!id || !bannerUrl || !name || !nameUrl || !sourceUrl || !source) return null;
  if (!license || !licenseUrl) return null;

  return {
    id,
    alt: str(raw.title),
    thumbUrl,
    bannerUrl,
    credit: {
      name,
      nameUrl,
      // "flickr" → "Flickr". The API returns a lowercase key, and the credit
      // line reads as a sentence.
      source: source.charAt(0).toUpperCase() + source.slice(1),
      sourceUrl,
      license: licenseLabel(license, str(raw.license_version)),
      licenseUrl,
    },
    // Openverse asks for no usage ping.
    useToken: null,
  };
}

/**
 * Search Openverse for photos matching `query`.
 *
 * Failures surface as a 400 the editor can print rather than a 500: Openverse
 * being slow, rate-limiting an anonymous caller, or down is a condition of the
 * outside world, not a fault in this instance, and the author needs to be told
 * which so they know whether retrying is worth it.
 */
export async function search(query: string, page = 1): Promise<StockPhoto[]> {
  const params = new URLSearchParams({
    q: query.slice(0, 100),
    page: String(page),
    page_size: String(PER_PAGE),
    license_type: LICENSE_FILTER,
    // Openverse flags what its providers marked as sensitive; a banner picker
    // in a writing tool should not surface it.
    mature: "false",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API}?${params}`, {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
      signal: controller.signal,
    });
  } catch {
    throw badRequest("Couldn't reach the photo search. Try again in a moment.");
  } finally {
    clearTimeout(timer);
  }

  // Openverse rate-limits anonymous callers by IP, so this instance is one
  // caller to them however many writers it has.
  if (res.status === 429) {
    throw badRequest("The photo search is busy right now. Try again in a minute.");
  }
  if (!res.ok) throw badRequest("Photo search failed. Try again in a moment.");

  const body = await res.json().catch(() => null) as { results?: RawImage[] } | null;
  return (body?.results ?? []).map(toPhoto).filter((p): p is StockPhoto => p !== null);
}
