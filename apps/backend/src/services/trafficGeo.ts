// SPDX-License-Identifier: AGPL-3.0-or-later
import { isIP } from "node:net";
import { open, type CountryResponse, type Reader } from "maxmind";
import { config } from "@/config.ts";

let reader: Promise<Reader<CountryResponse> | null> | undefined;
function database() {
  if (!config.TRAFFIC_GEOIP_PATH) return Promise.resolve(null);
  reader ??= open<CountryResponse>(config.TRAFFIC_GEOIP_PATH, {
    watchForUpdates: true,
    watchForUpdatesNonPersistent: true,
  }).catch(() => {
    console.error("traffic: country database unavailable; geography is disabled until restart.");
    return null;
  });
  return reader;
}

export async function geographyAvailable(): Promise<boolean> {
  return !!(await database());
}

// Lookup is local and ephemeral. Never trust client-supplied country headers.
export async function countryOf(ip: string): Promise<string> {
  if (!isIP(ip)) return "Unknown";
  const code = (await database())?.get(ip)?.country?.iso_code;
  return code && /^[A-Z]{2}$/.test(code) ? code : "Unknown";
}
