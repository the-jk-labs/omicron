import { fileURLToPath } from "node:url";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from "vitest/config";

// Mirror the deno.json import map so Vite resolves `@/…` .ts specifiers.
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) }],
  },
  test: {
    include: ["src/**/*_test.ts", "tests/**/*_test.ts"],
  },
});
