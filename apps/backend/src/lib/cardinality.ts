// SPDX-License-Identifier: AGPL-3.0-or-later
// HyperLogLog, p=12: mergeable distinct counts with 1.625% standard error.
export const REGISTERS = 4096;
export type Register = { index: number; rank: number };

export function registerOf(hash: Uint8Array): Register {
  if (hash.length < 8) throw new Error("Cardinality hashes need at least 64 bits.");
  const index = (hash[0] << 4) | (hash[1] >>> 4);
  let rank = 1;
  for (let bit = 12; bit < 64; bit++) {
    if (hash[bit >>> 3] & (1 << (7 - (bit & 7)))) break;
    rank++;
  }
  return { index, rank };
}

export function mergeInto(target: Uint8Array, source: Uint8Array): void {
  if (target.length !== REGISTERS || source.length !== REGISTERS) throw new Error("Invalid cardinality sketch.");
  for (let i = 0; i < REGISTERS; i++) target[i] = Math.max(target[i], source[i]);
}

export function cardinality(sketch: Uint8Array): number {
  if (sketch.length !== REGISTERS) throw new Error("Invalid cardinality sketch.");
  let sum = 0;
  let empty = 0;
  for (const rank of sketch) {
    sum += 2 ** -rank;
    if (rank === 0) empty++;
  }
  const estimate = ((0.7213 / (1 + 1.079 / REGISTERS)) * REGISTERS ** 2) / sum;
  return Math.round(estimate <= 2.5 * REGISTERS && empty ? REGISTERS * Math.log(REGISTERS / empty) : estimate);
}
