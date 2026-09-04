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
  plugins: [svelte(), svelteTesting()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    fsModuleCache: true,
    include: ["src/**/*.test.ts"],
    // Tailwind/theme CSS is irrelevant to these assertions and slows the run.
    css: false,
    environmentOptions: {
      jsdom: { url: "http://localhost" },
    },
  },
  resolve: {
    conditions: ["browser"],
    alias: {
      $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
      // SvelteKit's `$app/*` modules are virtual — there is no file to resolve
      // outside a kit build. Point them at the jsdom test doubles so components
      // that read `page`/`goto`/`browser` can be rendered directly.
      "$app/state": fileURLToPath(new URL("./src/test/mocks/$app/state.ts", import.meta.url)),
      "$app/navigation": fileURLToPath(new URL("./src/test/mocks/$app/navigation.ts", import.meta.url)),
      "$app/stores": fileURLToPath(new URL("./src/test/mocks/$app/stores.ts", import.meta.url)),
      "$app/environment": fileURLToPath(new URL("./src/test/mocks/$app/environment.ts", import.meta.url)),
      "$env/dynamic/public": fileURLToPath(new URL("./src/test/mocks/$env/dynamic/public.ts", import.meta.url)),
    },
  },
});
