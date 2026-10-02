// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { decodeCursor, encodeCursor, paginate } from "@/lib/pagination.ts";
import { uuid } from "../fixtures.ts";

// Keyset pagination powers every feed. A broken cursor means dropped or
// duplicated rows as people scroll, so round-tripping and the limit+1 split
// are pinned here.

test("cursor: encode/decode round-trips", () => {
  const c = { createdAt: "2026-07-05T00:00:00.000Z", id: "0b0e7c4e-5d2a-4e0f-9f53-5f5a4f0d3a11" };
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
    { id: uuid(1), createdAt: new Date("2026-07-05T00:00:03Z") },
    { id: uuid(2), createdAt: new Date("2026-07-05T00:00:02Z") },
    { id: uuid(3), createdAt: new Date("2026-07-05T00:00:01Z") },
  ];
  const { items, nextCursor } = paginate(rows, 2);
  expect(items.map((r) => r.id)).toEqual([uuid(1), uuid(2)]);
  expect(nextCursor !== null).toBe(true);
  expect(decodeCursor(nextCursor)).toEqual({ createdAt: rows[1].createdAt.toISOString(), id: uuid(2) });
});

test("cursor: decode rejects input that is not base64", () => {
  expect(decodeCursor("%%%not-base64%%%")).toBe(null);
});

test("cursor: extra separators after the id are ignored", () => {
  expect(decodeCursor(btoa(`2026-07-05T00:00:00.000Z|${uuid(1)}|extra`))).toEqual({
    createdAt: "2026-07-05T00:00:00.000Z",
    id: uuid(1),
  });
});

test("paginate: an empty page has no cursor", () => {
  expect(paginate([], 20)).toEqual({ items: [], nextCursor: null });
});

// The repositories bind both halves into SQL, where an Invalid Date or a
// non-uuid id is a 500 for what is only a malformed request.
test("cursor: decode rejects a timestamp that is not a date", () => {
  expect(decodeCursor(btoa("not-a-date|0b0e7c4e-5d2a-4e0f-9f53-5f5a4f0d3a11"))).toBe(null);
});

test("cursor: decode rejects an id that is not a uuid", () => {
  expect(decodeCursor(btoa("2026-07-05T00:00:00.000Z|'; drop table posts;--"))).toBe(null);
});
