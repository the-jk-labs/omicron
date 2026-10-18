// SPDX-License-Identifier: AGPL-3.0-or-later
import { isIP } from "node:net";

function addressValue(address: string): { bits: number; value: bigint } {
  const version = isIP(address);
  if (!version || address.includes("%")) throw new Error("Enter a valid IPv4 or IPv6 address.");
  if (version === 4) {
    return { bits: 32, value: address.split(".").reduce((value, octet) => (value << 8n) | BigInt(octet), 0n) };
  }
  let expanded = address;
  if (expanded.includes(".")) {
    const boundary = expanded.lastIndexOf(":");
    const ipv4 = addressValue(expanded.slice(boundary + 1)).value;
    expanded = `${expanded.slice(0, boundary)}:${(ipv4 >> 16n).toString(16)}:${(ipv4 & 65535n).toString(16)}`;
  }
  const [left, right] = expanded.split("::");
  const start = left ? left.split(":") : [];
  const end = right ? right.split(":") : [];
  const groups =
    right === undefined ? start : [...start, ...Array<string>(8 - start.length - end.length).fill("0"), ...end];
  return { bits: 128, value: groups.reduce((value, group) => (value << 16n) | BigInt(`0x${group}`), 0n) };
}

function parseNetwork(input: string) {
  const parts = input.trim().split("/");
  if (parts.length > 2) throw new Error("Enter one IP address or CIDR range.");
  const address = addressValue(parts[0]);
  const prefix = parts[1] === undefined ? address.bits : Number(parts[1]);
  if (parts[1] !== undefined && (!/^\d+$/.test(parts[1]) || prefix < 0 || prefix > address.bits)) {
    throw new Error(`CIDR prefix must be between 0 and ${address.bits}.`);
  }
  // Match Caddy's unmapped IPv4 semantics rather than accepting ambiguous mapped ranges.
  if (address.bits === 128 && address.value >> 32n === 65535n) {
    throw new Error("Use an IPv4 address instead of an IPv4-mapped IPv6 range.");
  }
  const shift = BigInt(address.bits - prefix);
  return { bits: address.bits, prefix, value: (address.value >> shift) << shift };
}

export function normalizeNetwork(input: string): string {
  const { bits, prefix, value } = parseNetwork(input);
  const address =
    bits === 32
      ? [24n, 16n, 8n, 0n].map((shift) => String((value >> shift) & 255n)).join(".")
      : Array.from({ length: 8 }, (_, i) => ((value >> BigInt((7 - i) * 16)) & 65535n).toString(16)).join(":");
  return `${address}/${prefix}`;
}

export function networkContains(network: string, input: string): boolean {
  const range = parseNetwork(network);
  let address = addressValue(input);
  if (address.bits === 128 && address.value >> 32n === 65535n) {
    address = { bits: 32, value: address.value & 4294967295n };
  }
  return (
    range.bits === address.bits &&
    address.value >> BigInt(range.bits - range.prefix) === range.value >> BigInt(range.bits - range.prefix)
  );
}

export function validateAddress(input: string): void {
  addressValue(input);
}
