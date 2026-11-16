// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { APP_VERSION } from "@/version.ts";

const packageVersion = (path: string): string =>
  (JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as { version: string }).version;

// A release bumps all three; /version, NodeInfo and the federation User-Agent report APP_VERSION.
test("APP_VERSION matches the backend and frontend package versions", () => {
  expect(APP_VERSION).toBe(packageVersion("../package.json"));
  expect(APP_VERSION).toBe(packageVersion("../../frontend/package.json"));
});

test("APP_VERSION is a release version", () => {
  expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
});
