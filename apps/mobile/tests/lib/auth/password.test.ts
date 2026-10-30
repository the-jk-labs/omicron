import { createHash } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import type { Fetcher } from "@/lib/api/client";
import { isPwnedPassword, passwordRequirements, passwordStrength, sha1Hex } from "@/lib/auth/password";

const nodeSha1 = (text: string) => createHash("sha1").update(text, "utf8").digest("hex").toUpperCase();

describe("sha1Hex", () => {
  test.each([
    "",
    "abc",
    "password",
    "Unique-test-password-123!",
    "çəşğüöı 🙂",
    "x".repeat(55),
    "y".repeat(64),
    "z".repeat(1000),
  ])("matches Node's SHA-1 for %j", (input) => {
    expect(sha1Hex(input)).toBe(nodeSha1(input));
  });
});

describe("passwordStrength", () => {
  test("follows the web's scoring", () => {
    expect(passwordStrength("")).toEqual({ score: 0, label: "" });
    expect(passwordStrength("Ab1!")).toEqual({ score: 1, label: "Weak" });
    expect(passwordStrength("abcdefghijkl")).toEqual({ score: 1, label: "Weak" });
    expect(passwordStrength("Abcdefghijk1")).toEqual({ score: 3, label: "Good" });
    expect(passwordStrength("Abcdefghijk1!")).toEqual({ score: 4, label: "Strong" });
  });

  test("lists which requirements are met", () => {
    expect(passwordRequirements("abc").map((r) => [r.id, r.ok])).toEqual([
      ["len", false],
      ["case", false],
      ["num", false],
      ["sym", false],
    ]);
  });
});

describe("isPwnedPassword", () => {
  const password = "correct horse battery";
  const hash = nodeSha1(password);

  test("sends only the 5-character prefix and finds the suffix", async () => {
    const fetch = vi.fn<Fetcher>(
      async () => new Response(`0000000000000000000000000000000000A:3\n${hash.slice(5)}:12\n`),
    );
    await expect(isPwnedPassword(password, fetch)).resolves.toBe(true);
    expect(fetch.mock.calls[0][0]).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
  });

  test("not in the list", async () => {
    await expect(
      isPwnedPassword(
        password,
        vi.fn<Fetcher>(async () => new Response("ABC:1")),
      ),
    ).resolves.toBe(false);
  });

  test("fails open: unknown on errors, skipped for short passwords", async () => {
    await expect(
      isPwnedPassword(
        password,
        vi.fn<Fetcher>(async () => new Response("", { status: 503 })),
      ),
    ).resolves.toBeNull();
    await expect(
      isPwnedPassword(
        password,
        vi.fn<Fetcher>(async () => Promise.reject(new TypeError("offline"))),
      ),
    ).resolves.toBeNull();
    const fetch = vi.fn<Fetcher>();
    await expect(isPwnedPassword("short", fetch)).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
