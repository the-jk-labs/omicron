// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { decodeCursor, encodeCursor, paginate } from "@/lib/pagination.ts";

// Keyset pagination powers every feed. A broken cursor means dropped or
// duplicated rows as people scroll, so round-tripping and the limit+1 split
// are pinned here.

test("cursor: encode/decode round-trips", () => {
  const c = { createdAt: "2026-07-05T00:00:00.000Z", id: "abc-123" };
  expect(decodeCursor(encodeCursor(c))).toEqual(c);
});

test("cursor: decode returns null for empty or malformed input", () => {
  expect(decodeCursor(null)).toBe(null);
  expect(decodeCursor(undefined)).toBe(null);
  expect(decodeCursor("")).toBe(null);
  // Valid base64 but missing the id half.
  expect(decodeCursor(btoa("2026-07-05"))).toBe(null);
});

test("paginate: no extra row -> no next cursor", () => {
  const rows = [
    { id: "1", createdAt: new Date("2026-07-05T00:00:02Z") },
    { id: "2", createdAt: new Date("2026-07-05T00:00:01Z") },
  ];
  const { items, nextCursor } = paginate(rows, 2);
  expect(items.length).toBe(2);
  expect(nextCursor).toBe(null);
});

test("paginate: limit+1 row -> trims to limit and emits a cursor for the last kept row", () => {
  const rows = [
    { id: "1", createdAt: new Date("2026-07-05T00:00:03Z") },
    { id: "2", createdAt: new Date("2026-07-05T00:00:02Z") },
    { id: "3", createdAt: new Date("2026-07-05T00:00:01Z") },
  ];
  const { items, nextCursor } = paginate(rows, 2);
  expect(items.map((r) => r.id)).toEqual(["1", "2"]);
  expect(nextCursor !== null).toBe(true);
  expect(decodeCursor(nextCursor)).toEqual({ createdAt: rows[1].createdAt.toISOString(), id: "2" });
});

test("cursor: decode rejects input that is not base64", () => {
  expect(decodeCursor("%%%not-base64%%%")).toBe(null);
});

test("cursor: extra separators after the id are ignored", () => {
  expect(decodeCursor(btoa("2026-07-05T00:00:00.000Z|abc|extra"))).toEqual({
    createdAt: "2026-07-05T00:00:00.000Z",
    id: "abc",
  });
});

test("paginate: an empty page has no cursor", () => {
  expect(paginate([], 20)).toEqual({ items: [], nextCursor: null });
});

// BUG: decodeCursor only checks that both halves are non-empty. A crafted
// cursor such as btoa("x|y") reaches the repositories, where `new Date("x")` is
// an Invalid Date and "y" is not a uuid, so a public feed answers 500 for what
// is a malformed request. Invalid cursors should decode to null.
test.fails("BUG: cursor: decode rejects a timestamp that is not a date", () => {
  expect(decodeCursor(btoa("not-a-date|0b0e7c4e-5d2a-4e0f-9f53-5f5a4f0d3a11"))).toBe(null);
});

test.fails("BUG: cursor: decode rejects an id that is not a uuid", () => {
  expect(decodeCursor(btoa("2026-07-05T00:00:00.000Z|'; drop table posts;--"))).toBe(null);
});
