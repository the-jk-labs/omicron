// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import { withAttributionDomains } from "@/federation/attribution.ts";

const TOOT = {
  toot: "http://joinmastodon.org/ns#",
  attributionDomains: { "@id": "toot:attributionDomains", "@type": "@id" },
};

function actor(doc: Record<string, unknown>, init: ResponseInit = {}) {
  return new Response(JSON.stringify(doc), {
    status: 200,
    headers: { "content-type": "application/activity+json", "content-length": "999", "x-extra": "kept" },
    ...init,
  });
}

describe("withAttributionDomains", () => {
  test("adds the domain and its context term to a Person", async () => {
    const res = await withAttributionDomains(
      actor({ "@context": "https://www.w3.org/ns/activitystreams", type: "Person", id: "x" }),
      "blog.example",
    );
    expect(await res.json()).toEqual({
      "@context": ["https://www.w3.org/ns/activitystreams", TOOT],
      type: "Person",
      id: "x",
      attributionDomains: ["blog.example"],
    });
  });

  test("appends to an array context and creates one when absent", async () => {
    const arr = await withAttributionDomains(actor({ "@context": ["a", "b"], type: "Person" }), "d");
    expect((await arr.json())["@context"]).toEqual(["a", "b", TOOT]);
    const none = await withAttributionDomains(actor({ type: "Person" }), "d");
    expect((await none.json())["@context"]).toEqual([TOOT]);
  });

  test("keeps status and headers but drops the stale content-length", async () => {
    const res = await withAttributionDomains(actor({ type: "Person" }), "d");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-extra")).toBe("kept");
    expect(res.headers.get("content-length")).not.toBe("999");
  });

  test.for([
    ["a non-Person document", actor({ type: "OrderedCollection" })],
    ["an error", actor({ type: "Person" }, { status: 404 })],
    ["a non-JSON body", new Response("<html>", { headers: { "content-type": "text/html" } })],
    ["broken JSON", new Response("{not json", { headers: { "content-type": "application/json" } })],
  ])("returns %s untouched", async ([, res]) => {
    expect(await withAttributionDomains(res as Response, "d")).toBe(res);
  });
});
