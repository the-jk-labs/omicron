// SPDX-License-Identifier: AGPL-3.0-or-later
import { Buffer } from "node:buffer";

/** The WebAuthn origins Android reports for an app signed with these keys (`AA:BB:…` SHA-256 fingerprints). */
export function androidOrigins(fingerprints: readonly string[]): string[] {
  return fingerprints.map(
    (fingerprint) =>
      `android:apk-key-hash:${Buffer.from(fingerprint.replaceAll(":", ""), "hex").toString("base64url")}`,
  );
}
