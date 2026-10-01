import { fileURLToPath } from "node:url";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from "vitest/config";

// Mirror the deno.json import map so Vite resolves `@/…` .ts specifiers.
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) }],
  },
  test: {
    include: ["tests/**/*_test.ts"],
    fsModuleCache: true,
    slowTestThreshold: 2000,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text-summary", "json-summary", "html"],
    },
  },
});
