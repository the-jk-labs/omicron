import { readStorage, writeStorage } from "$lib/storage";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

test("reads, writes and removes like localStorage", () => {
  writeStorage("k", "v");
  expect(readStorage("k")).toBe("v");
  writeStorage("k", null);
  expect(readStorage("k")).toBe(null);
});

// With site data blocked, even the `localStorage` getter throws a SecurityError.
test("a browser that blocks storage reads nothing and writes nowhere, without throwing", () => {
  vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  });
  expect(readStorage("k")).toBe(null);
  expect(() => writeStorage("k", "v")).not.toThrow();
  expect(() => writeStorage("k", null)).not.toThrow();
});
