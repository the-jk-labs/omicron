// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";
import { normalizeDomain } from "@/lib/domain.ts";
import type { FetchJson } from "@/lib/publicJson.ts";

// Client for the FediDB directory (https://fedidb.com), which crawls NodeInfo
// across the fediverse. Its public API needs no key. The per-software server
// list (`/v1/software/{slug}/servers`) is what its own site uses; it pages with
// an opaque cursor, at most 20 servers a page.

export const FEDIDB_API = "https://api.fedidb.org/v1";
const PAGE_SIZE = 20;
// 50 pages is 1,000 servers: far beyond the network today, and a hard stop if
// the directory ever answered with a cursor loop.
const MAX_PAGES = 50;
const PAGE_TIMEOUT_MS = 15_000;
// The API allows 100 requests a minute; a short pause keeps one run well under it.
const PAGE_DELAY_MS = 300;

const ServerPage = z.object({
  data: z.array(
    z.object({
      domain: z.string(),
      software: z.object({ slug: z.string() }).nullish(),
    }),
  ),
  meta: z.object({ next_cursor: z.string().nullish() }).nullish(),
});

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Every domain FediDB lists as running `slug`, normalized and de-duplicated.
// Throws when the directory can't be read, so a failed run never looks like an
// empty network.
export async function listServers(fetchJson: FetchJson, slug = "omicron"): Promise<string[]> {
  const domains = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${FEDIDB_API}/software/${encodeURIComponent(slug)}/servers`);
    url.searchParams.set("limit", String(PAGE_SIZE));
    if (cursor) url.searchParams.set("cursor", cursor);
    const parsed = ServerPage.safeParse(await fetchJson(url.href, AbortSignal.timeout(PAGE_TIMEOUT_MS)));
    if (!parsed.success) throw new Error("FediDB answered in an unexpected format.");
    for (const server of parsed.data.data) {
      // The endpoint is already per-software; the check guards against it ever widening.
      if (server.software && server.software.slug !== slug) continue;
      const domain = normalizeDomain(server.domain);
      if (domain) domains.add(domain);
    }
    const next = parsed.data.meta?.next_cursor ?? null;
    if (!next || next === cursor) break;
    cursor = next;
    await delay(PAGE_DELAY_MS);
  }
  return [...domains];
}
