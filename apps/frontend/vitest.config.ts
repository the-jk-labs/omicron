// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Vitest config for the frontend unit/component suite. Deliberately separate
// from vite.config.ts: the app build uses the `sveltekit()` plugin, which is not
// meaningful for component tests (there is no route tree, adapter, or server
// here). Component tests compile `.svelte` files directly with the Svelte
// plugin and run in jsdom.
//
// `@testing-library/svelte/vite`'s `svelteTesting()` plugin does three things
// under the hood that the app build does not need: it puts the `browser`
// resolve condition ahead of `node` (so Svelte's client code is used), marks
// the svelte/Testing-Library packages as non-external, and registers automatic
// `cleanup()` between tests.
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Kit config lives in vite.config.ts now; tests need none of it.
  plugins: [svelte({ configFile: false }), svelteTesting()],
  test: {
    environment: "jsdom",
    // One jsdom per worker instead of per file (still isolated per file): ~2x faster.
    pool: "vmThreads",
    setupFiles: ["./tests/setup.ts"],
    fsModuleCache: true,
    include: ["tests/**/*.test.ts"],
    // Cold imports (bits-ui, Tiptap, fresh module graphs) under a fully
    // parallel run can pass the 5s default.
    testTimeout: 15_000,
    // Tailwind/theme CSS is irrelevant to these assertions and slows the run.
    css: false,
    mockReset: true,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    // BUG pins for unhandled rejections tag their error so the leak doesn't fail the run.
    onUnhandledError: (error) => !error.message?.includes("[BUG pin]"),
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,svelte}"],
      exclude: ["src/**/*.d.ts"],
      reporter: ["text-summary", "json-summary", "html"],
    },
    environmentOptions: {
      jsdom: { url: "http://localhost" },
    },
  },
  resolve: {
    conditions: ["browser"],
    alias: {
      // SvelteKit's `$app/*` modules are virtual — there is no file to resolve
      // outside a kit build. Point them at the jsdom test doubles so components
      // that read `page`/`goto`/`browser` can be rendered directly.
      "$app/state": fileURLToPath(new URL("./tests/mocks/$app/state.ts", import.meta.url)),
      "$app/navigation": fileURLToPath(new URL("./tests/mocks/$app/navigation.ts", import.meta.url)),
      // Before `$app/env`, which would otherwise match these as `$app/env/…` prefixes.
      "$app/env/public": fileURLToPath(new URL("./tests/mocks/$app/env/public.ts", import.meta.url)),
      "$app/env/private": fileURLToPath(new URL("./tests/mocks/$app/env/private.ts", import.meta.url)),
      "$app/env": fileURLToPath(new URL("./tests/mocks/$app/env.ts", import.meta.url)),
    },
  },
});
