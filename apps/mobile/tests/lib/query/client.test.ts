import { API_VERSION } from "@omicron/contract";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { describe, expect, test } from "vitest";
import { cacheBuster, trimForPersist } from "@/lib/query/client";

type Query = PersistedClient["clientState"]["queries"][number];

const query = (queryKey: unknown[], data: unknown, dataUpdatedAt = 0): Query => ({
  queryKey,
  queryHash: JSON.stringify(queryKey),
  dehydratedAt: 0,
  state: {
    data,
    dataUpdatedAt,
    dataUpdateCount: 1,
    error: null,
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    fetchFailureCount: 0,
    fetchFailureReason: null,
    fetchMeta: null,
    isInvalidated: false,
    status: "success",
    fetchStatus: "idle",
  },
});

const client = (queries: Query[]): PersistedClient => ({
  timestamp: 0,
  buster: "",
  clientState: { mutations: [], queries },
});

const kept = (persisted: PersistedClient) => persisted.clientState.queries.map((q) => q.queryKey);

describe("trimForPersist", () => {
  test("keeps the first two pages of a list, so a cold start shows the top of every feed", () => {
    const feed = { pages: [1, 2, 3, 4, 5].map((n) => ({ items: [n] })), pageParams: [null, "a", "b", "c", "d"] };
    const [stored] = trimForPersist(client([query(["feed", "local"], feed)])).clientState.queries;

    expect(stored?.state.data).toEqual({ pages: [{ items: [1] }, { items: [2] }], pageParams: [null, "a"] });
  });

  test("leaves short lists and plain queries untouched", () => {
    const me = query(["me"], { id: "u1" });
    const feed = query(["feed", "global"], { pages: [{ items: [] }], pageParams: [null] });
    expect(trimForPersist(client([me, feed])).clientState.queries).toEqual([me, feed]);
  });

  test("drops what is only worth having fresh: searches, tag suggestions, admin and sessions", () => {
    const persisted = trimForPersist(
      client([
        query(["search", "linux"], {}),
        query(["tag-suggest", "li"], []),
        query(["admin-users", "", ""], {}),
        query(["sessions"], []),
        query(["me"], {}),
      ]),
    );
    expect(kept(persisted)).toEqual([["me"]]);
  });

  test("keeps every post that was opened, so each reopens at once after a restart", () => {
    const posts = Array.from({ length: 40 }, (_, n) => query(["post", "ada", `p${n}`], { id: n }, n));
    expect(trimForPersist(client(posts)).clientState.queries).toHaveLength(40);
  });
});

describe("cacheBuster", () => {
  test("changes with the build, the over-the-air update and the contract version", () => {
    const base = cacheBuster("7", "update-1", 1);
    expect(cacheBuster("8", "update-1", 1)).not.toBe(base);
    expect(cacheBuster("7", "update-2", 1)).not.toBe(base);
    expect(cacheBuster("7", "update-1", 2)).not.toBe(base);
    expect(cacheBuster("7", "update-1", 1)).toBe(base);
  });

  test("defaults to this build and the contract's version", () => {
    expect(cacheBuster()).toBe(`${API_VERSION}:7:update-1`);
  });
});
