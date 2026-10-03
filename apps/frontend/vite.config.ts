import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter({ precompress: true }),
      // Backend source, for deriving API types from its serializers. Only ever `import type` through it.
      alias: { "@": "../backend/src" },
      // `auto` hashes SvelteKit's inline script, so `script-src` needs no `unsafe-inline`.
      csp: {
        mode: "auto",
        directives: {
          "default-src": ["self"],
          "script-src": ["self"],
          "style-src": ["self", "unsafe-inline"],
          "img-src": ["self", "data:", "blob:", "http:", "https:"],
          "font-src": ["self", "data:"],
          "connect-src": ["self"],
          "worker-src": ["self", "blob:"],
          "frame-ancestors": ["none"],
          "base-uri": ["self"],
          "form-action": ["self"],
          "object-src": ["none"],
        },
      },
    }),
  ],
});
