import { API_VERSION } from "@omicron/contract";
import { expect, test } from "vitest";
import { needsAppUpdate } from "@/lib/api/version";

test("asks for an update only when the instance's API is newer than the app's", () => {
  expect(needsAppUpdate(API_VERSION + 1)).toBe(true);
  expect(needsAppUpdate(API_VERSION)).toBe(false);
  expect(needsAppUpdate(API_VERSION - 1)).toBe(false);
});
