// SPDX-License-Identifier: AGPL-3.0-or-later
import { lookup } from "node:dns";
import { isIP, type LookupFunction } from "node:net";
import { isPrivateIPv4Number, isPrivateIPv6, parseIPv4ToNumber } from "@/federation/ssrf.ts";

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) return !isPrivateIPv4Number(parseIPv4ToNumber(address)!);
  if (isIP(address) !== 6) return false;
  const [first, second] = address.toLowerCase().split(":");
  const subnet = parseInt(second || "0", 16);
  // Only global unicast IPv6, excluding documentation and transition ranges.
  return (
    /^[23]/.test(first) &&
    !(first === "2001" && (subnet < 0x200 || subnet === 0xdb8)) &&
    first !== "3fff" &&
    !isPrivateIPv6(address)
  );
}

// The validated address is handed straight to the socket, with no second lookup.
export const publicAddressLookup: LookupFunction = (host, options, callback) => {
  lookup(host, { all: true }, (error, records) => {
    if (error || !records.length || records.some((record) => !isPublicAddress(record.address))) {
      callback(new Error("Non-public host."), "", 0);
    } else if (options.all) {
      callback(null, records);
    } else {
      callback(null, records[0].address, records[0].family);
    }
  });
};
