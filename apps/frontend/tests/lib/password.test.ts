import { isPwnedPasswordClient, MIN_PASSWORD_LEN, passwordRequirements, passwordStrength } from "$lib/password";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test, vi } from "vitest";

describe("passwordStrength", () => {
  test.for([
    ["", 0, ""],
    ["aaaaaaaaaaaa", 1, "Weak"],
    ["aaaaaaaaaaaaaaaa", 2, "Fair"],
    ["aaaaaaaaAAAA1", 3, "Good"],
    ["aaaaaaaaAAAA1!", 4, "Strong"],
    ["aaaaaaaaAAAA1!xyz", 4, "Strong"],
  ] as const)("%s scores %i (%s)", ([pw, score, label]) => {
    expect(passwordStrength(pw)).toEqual({ score, label });
  });

  // BUG: the meter scores character classes without regard to the minimum
  // length, so "Ab1!" — four characters, rejected on submit — is labelled
  // "Good". The meter and the requirement list beside it then disagree about
  // the same password.
  test.fails("BUG: a password under the minimum length is never rated above Weak", () => {
    expect(passwordStrength("Ab1!").score).toBeLessThanOrEqual(1);
  });
});

test("requirements report each rule independently", () => {
  expect(passwordRequirements("abc").map((r) => [r.id, r.ok])).toEqual([
    ["len", false],
    ["case", false],
    ["num", false],
    ["sym", false],
  ]);
  expect(passwordRequirements("Abcdefghijk1!").every((r) => r.ok)).toBe(true);
  expect(passwordRequirements("")[0].label).toBe(`At least ${MIN_PASSWORD_LEN} characters`);
});

describe("isPwnedPasswordClient", () => {
  async function sha1(pw: string) {
    const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(pw));
    return [...new Uint8Array(buf)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }

  test("sends only the 5-char prefix, padded, and matches the suffix case-insensitively", async () => {
    const pw = "correct horse battery";
    const hash = await sha1(pw);
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(`0000000000000000000000000000000000A:3\r\n${hash.slice(5).toLowerCase()}:12\r\n`),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await isPwnedPasswordClient(pw)).toBe(true);
    expect(fetch).toHaveBeenCalledWith(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { "Add-Padding": "true" },
    });
  });

  test("not in the range is false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async () => new Response("ABC:1\n")),
    );
    expect(await isPwnedPasswordClient("a long unique passphrase")).toBe(false);
  });

  test("fails open: too short, an error status, or a network failure is null", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    expect(await isPwnedPasswordClient("short")).toBe(null);
    expect(fetch).not.toHaveBeenCalled();
    expect(await isPwnedPasswordClient("a long unique passphrase")).toBe(null);
    fetch.mockRejectedValue(new TypeError("offline"));
    expect(await isPwnedPasswordClient("a long unique passphrase")).toBe(null);
  });
});
