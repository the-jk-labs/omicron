// SPDX-License-Identifier: AGPL-3.0-or-later
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("../../../src/", import.meta.url)) }],
  },
  test: {
    include: ["tests/integration/federation/instance.ts"],
    maxWorkers: 1,
    fileParallelism: false,
    disableConsoleIntercept: true,
    testTimeout: 180_000,
  },
});
