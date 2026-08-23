// SPDX-License-Identifier: AGPL-3.0-or-later
import { assertEquals } from "@std/assert";
import {
  diversify,
  MAX_CONSECUTIVE_SAME_AUTHOR,
  maxPerAuthorPerPage,
} from "@/lib/feedDiversity.ts";

// The discovery timelines must not let one author fill a page. These tests
// pin the two caps (consecutive run, per-page share), the relaxation that
// keeps pages from starving, and the `scanned` count the cursor relies on.

function rowsOf(...authors: string[]) {
  return authors.map((author, i) => ({ author, id: `p${i}` }));
}

Deno.test("maxPerAuthorPerPage: about a fifth of the page, minimum 2", () => {
  assertEquals(maxPerAuthorPerPage(20), 4);
  assertEquals(maxPerAuthorPerPage(12), 3);
  assertEquals(maxPerAuthorPerPage(5), 2);
});

Deno.test("diversify: breaks a consecutive same-author run when relief exists", () => {
  const { kept, scanned } = diversify(rowsOf("a", "a", "a", "a", "b"), 5, (r) => r.author);
  // The third `a` is held back as long as something else can take the slot.
  assertEquals(kept.map((r) => r.author), ["a", "a", "b"]);
  assertEquals(MAX_CONSECUTIVE_SAME_AUTHOR, 2);
  assertEquals(scanned, 5);
});

Deno.test("diversify: share cap limits one author's presence on a page", () => {
  // a,a,b,a,a,c,a,a,d — the interleaved b/c/d let `a` back in twice more,
  // until its share cap (3 on a 12-row page) holds it off for good.
  const { kept } = diversify(
    rowsOf("a", "a", "b", "a", "a", "c", "a", "a", "d"),
    12,
    (r) => r.author,
  );
  assertEquals(kept.map((r) => r.author), ["a", "a", "b", "a", "c", "d"]);
  assertEquals(kept.filter((r) => r.author === "a").length, maxPerAuthorPerPage(12));
});

Deno.test("diversify: relaxes caps rather than returning a short page", () => {
  // Only one author left in the window — a third post in a row beats an
  // empty slot.
  const { kept, scanned } = diversify(rowsOf("a", "a", "a"), 5, (r) => r.author);
  assertEquals(kept.map((r) => r.author), ["a", "a", "a"]);
  assertEquals(scanned, 3);
});

Deno.test("diversify: reports scanned so the cursor can skip held-back rows", () => {
  const { kept, scanned } = diversify(rowsOf("a", "b", "c", "d"), 2, (r) => r.author);
  assertEquals(kept.map((r) => r.author), ["a", "b"]);
  assertEquals(scanned, 2);
});

Deno.test("diversify: state carries across windows of one page", () => {
  const { kept: firstKept, state } = diversify(rowsOf("a", "x", "b"), 20, (r) => r.author);
  assertEquals(firstKept.map((r) => r.author), ["a", "x", "b"]);
  // The previous window ended on `b`, so its run continues here: one more `b`
  // is allowed, a second is held back in favour of `c`. Without carried
  // state this window would have read [b, b, c].
  const { kept } = diversify(rowsOf("b", "b", "c"), 20, (r) => r.author, state);
  assertEquals(kept.map((r) => r.author), ["b", "c"]);
});
