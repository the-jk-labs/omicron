// SPDX-License-Identifier: AGPL-3.0-or-later
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";

// Discoverability / SEO settings, stored in the instance_settings k/v store and
// tuned by a moderator from the admin panel. Two concerns:
//
//   1. Whether search engines may index this instance at all (drives robots.txt
//      and a site-wide `noindex`). Opt-OUT: on by default — a blog wants readers.
//   2. Per-engine site-verification tokens (Bing/Google/Yandex), rendered as
//      `<meta>` tags in the app's <head> so the operator can claim the site in
//      each search console without editing files.
//
// See services/settings.ts for the same typed-accessor pattern.

const KEYS = {
  indexingEnabled: "seo.indexingEnabled",
  verification: "seo.verification",
  indexNowEnabled: "seo.indexNowEnabled",
  indexNowKey: "seo.indexNowKey",
} as const;

// Supported verification engines → the `<meta name>` each search console expects.
// The stored value per engine is just the token (the meta `content`), never the
// whole tag. Adding an engine here is all it takes to expose a new field.
export const VERIFICATION_ENGINES = {
  google: "google-site-verification",
  bing: "msvalidate.01",
  yandex: "yandex-verification",
} as const;

export type VerificationEngine = keyof typeof VERIFICATION_ENGINES;
export type SeoVerification = Partial<Record<VerificationEngine, string>>;

export interface SeoSettings {
  indexingEnabled: boolean;
  verification: SeoVerification;
  // IndexNow: ping participating engines the moment a post is published or
  // edited, instead of waiting to be crawled. Bing, Yandex, Seznam and others
  // honour it; Google does not participate.
  //
  // Off by default, and deliberately so. Turning it on makes this instance send
  // its URLs to third-party servers on every publish — a reasonable trade for
  // an operator who wants faster indexing, but not a thing self-hosted software
  // should start doing on someone's behalf without being asked. The key is
  // generated on first enable and served from a well-known path so the engines
  // can verify the sender owns the domain.
  indexNowEnabled: boolean;
  indexNowKey: string | null;
}

const ENGINE_KEYS = Object.keys(VERIFICATION_ENGINES) as VerificationEngine[];

// Keep only known engines with a non-empty token, so a stray/blanked field never
// renders an empty `<meta>` tag.
function cleanVerification(input: unknown): SeoVerification {
  const out: SeoVerification = {};
  if (input && typeof input === "object") {
    for (const engine of ENGINE_KEYS) {
      const value = (input as Record<string, unknown>)[engine];
      if (typeof value === "string" && value.trim() !== "") out[engine] = value.trim();
    }
  }
  return out;
}

export async function getSeoSettings(): Promise<SeoSettings> {
  const [indexing, verification, indexNow, key] = await Promise.all([
    settingsRepo.get<boolean>(KEYS.indexingEnabled),
    settingsRepo.get<SeoVerification>(KEYS.verification),
    settingsRepo.get<boolean>(KEYS.indexNowEnabled),
    settingsRepo.get<string>(KEYS.indexNowKey),
  ]);
  return {
    indexingEnabled: indexing ?? true,
    verification: cleanVerification(verification),
    indexNowEnabled: indexNow ?? false,
    indexNowKey: key ?? null,
  };
}

// Partial update: only the keys present in `patch` are written, so toggling
// indexing never clobbers the verification tokens and vice versa.
export async function setSeoSettings(
  patch: {
    indexingEnabled?: boolean;
    verification?: SeoVerification;
    indexNowEnabled?: boolean;
  },
): Promise<void> {
  if (patch.indexingEnabled !== undefined) {
    await settingsRepo.set(KEYS.indexingEnabled, patch.indexingEnabled);
  }
  if (patch.verification !== undefined) {
    await settingsRepo.set(KEYS.verification, cleanVerification(patch.verification));
  }
  if (patch.indexNowEnabled !== undefined) {
    await settingsRepo.set(KEYS.indexNowEnabled, patch.indexNowEnabled);
    // Mint the key the first time it is switched on, and keep it thereafter —
    // rotating it would invalidate the key file the engines have already
    // fetched, and every URL submitted under the old one.
    if (patch.indexNowEnabled && !(await settingsRepo.get<string>(KEYS.indexNowKey))) {
      await settingsRepo.set(KEYS.indexNowKey, crypto.randomUUID().replaceAll("-", ""));
    }
  }
}
