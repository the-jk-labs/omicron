import { fileURLToPath } from "node:url";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) }],
  },
  test: {
    fsModuleCache: true,
    slowTestThreshold: 2000,
    // Cold imports (Better Auth, Fedify) under a fully parallel run can pass 5s.
    testTimeout: 15_000,
    mockReset: true,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    env: {
      DOTENV_PATH: fileURLToPath(new URL("./tests/test.env", import.meta.url)),
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text-summary", "json-summary", "html"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: [...configDefaults.exclude, "tests/integration/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          // Every file truncates the same database, so they must not overlap.
          fileParallelism: false,
        },
      },
    ],
  },
});
