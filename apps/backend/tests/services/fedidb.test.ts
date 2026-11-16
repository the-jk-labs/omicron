// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, vi } from "vitest";
import type { FetchJson } from "@/lib/publicJson.ts";
import { FEDIDB_API, listServers } from "@/services/fedidb.ts";

const server = (domain: string, slug = "omicron") => ({ domain, software: { slug } });

// Answers each request from the cursor it carries.
function directory(pages: Record<string, unknown>) {
  return vi.fn<FetchJson>(async (url) => {
    const cursor = new URL(url).searchParams.get("cursor") ?? "";
    if (!(cursor in pages)) throw new Error(`unexpected cursor ${cursor}`);
    return pages[cursor];
  });
}

test("walks every page and returns normalized, de-duplicated domains", async () => {
  const fetchJson = directory({
    "": { data: [server("Omicron.Blog"), server("akifzada.com")], meta: { next_cursor: "c1" } },
    c1: { data: [server("omicron.blog"), server("third.example")], meta: { next_cursor: null } },
  });
  expect(await listServers(fetchJson)).toEqual(["omicron.blog", "akifzada.com", "third.example"]);
  const first = new URL(fetchJson.mock.calls[0][0]);
  expect(`${first.origin}${first.pathname}`).toBe(`${FEDIDB_API}/software/omicron/servers`);
  expect(first.searchParams.get("limit")).toBe("20");
  expect(new URL(fetchJson.mock.calls[1][0]).searchParams.get("cursor")).toBe("c1");
});

test("skips other software and entries that aren't hostnames", async () => {
  const fetchJson = directory({
    "": { data: [server("mastodon.example", "mastodon"), server("not a domain"), server("ok.example")], meta: {} },
  });
  expect(await listServers(fetchJson)).toEqual(["ok.example"]);
});

test("stops on a cursor that repeats instead of looping", async () => {
  const fetchJson = directory({
    "": { data: [server("a.example")], meta: { next_cursor: "same" } },
    same: { data: [server("b.example")], meta: { next_cursor: "same" } },
  });
  expect(await listServers(fetchJson)).toEqual(["a.example", "b.example"]);
  expect(fetchJson).toHaveBeenCalledTimes(2);
});

test("a malformed or failed answer throws, so it never reads as an empty network", async () => {
  await expect(listServers(directory({ "": { servers: [] } }))).rejects.toThrow(/unexpected format/);
  await expect(listServers(vi.fn<FetchJson>().mockRejectedValue(new Error("HTTP 503")))).rejects.toThrow("HTTP 503");
});
