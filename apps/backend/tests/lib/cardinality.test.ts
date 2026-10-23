// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { cardinality, mergeInto, registerOf, REGISTERS } from "@/lib/cardinality.ts";

function sketch(from: number, to: number) {
  const result = new Uint8Array(REGISTERS);
  for (let i = from; i < to; i++) {
    const { index, rank } = registerOf(createHash("sha256").update(`visitor:${i}`).digest());
    result[index] = Math.max(result[index], rank);
  }
  return result;
}

test("empty and singleton sketches count correctly; duplicates are idempotent", () => {
  expect(cardinality(new Uint8Array(REGISTERS))).toBe(0);
  const one = sketch(0, 1);
  mergeInto(one, sketch(0, 1));
  expect(cardinality(one)).toBe(1);
});

test.for([10, 100, 1000, 10_000, 100_000])("estimates %d visitors within a 5% tolerance", (size) => {
  expect(Math.abs(cardinality(sketch(0, size)) - size) / size).toBeLessThan(0.05);
});

test("merging overlapping daily sketches counts returning visitors once", () => {
  const first = sketch(0, 10_000);
  mergeInto(first, sketch(5000, 15_000));
  expect(first).toEqual(sketch(0, 15_000));
  expect(cardinality(first)).toBeGreaterThan(14_500);
  expect(cardinality(first)).toBeLessThan(15_500);
});

test("register indexing and leading-zero rank use disjoint bits", () => {
  const hash = new Uint8Array(8);
  hash[0] = 0xab;
  hash[1] = 0xc4;
  expect(registerOf(hash)).toEqual({ index: 0xabc, rank: 2 });
  expect(registerOf(new Uint8Array(8))).toEqual({ index: 0, rank: 53 });
  expect(() => registerOf(new Uint8Array(2))).toThrow("Cardinality hashes need at least 64 bits.");
  expect(() => cardinality(new Uint8Array(1))).toThrow("Invalid cardinality sketch.");
  expect(() => mergeInto(new Uint8Array(REGISTERS), new Uint8Array(1))).toThrow("Invalid cardinality sketch.");
});
