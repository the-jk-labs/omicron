// SPDX-License-Identifier: AGPL-3.0-or-later
import { assertEquals } from "@std/assert";
import { decodeCursor, encodeCursor, paginate } from "@/lib/pagination.ts";

// Keyset pagination powers every feed. A broken cursor means dropped or
// duplicated rows as people scroll, so round-tripping and the limit+1 split
// are pinned here.

Deno.test("cursor: encode/decode round-trips", () => {
  const c = { createdAt: "2026-07-05T00:00:00.000Z", id: "abc-123" };
  assertEquals(decodeCursor(encodeCursor(c)), c);
});

Deno.test("cursor: decode returns null for empty or malformed input", () => {
  assertEquals(decodeCursor(null), null);
  assertEquals(decodeCursor(undefined), null);
  assertEquals(decodeCursor(""), null);
  // Valid base64 but missing the id half.
  assertEquals(decodeCursor(btoa("2026-07-05")), null);
});

Deno.test("paginate: no extra row -> no next cursor", () => {
  const rows = [
    { id: "1", createdAt: new Date("2026-07-05T00:00:02Z") },
    { id: "2", createdAt: new Date("2026-07-05T00:00:01Z") },
  ];
  const { items, nextCursor } = paginate(rows, 2);
  assertEquals(items.length, 2);
  assertEquals(nextCursor, null);
});

Deno.test("paginate: limit+1 row -> trims to limit and emits a cursor for the last kept row", () => {
  const rows = [
    { id: "1", createdAt: new Date("2026-07-05T00:00:03Z") },
    { id: "2", createdAt: new Date("2026-07-05T00:00:02Z") },
    { id: "3", createdAt: new Date("2026-07-05T00:00:01Z") },
  ];
  const { items, nextCursor } = paginate(rows, 2);
  assertEquals(items.map((r) => r.id), ["1", "2"]);
  assertEquals(nextCursor !== null, true);
  assertEquals(decodeCursor(nextCursor), { createdAt: rows[1].createdAt.toISOString(), id: "2" });
});
