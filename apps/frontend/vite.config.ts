import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { STYLE_ATTRIBUTE_HASHES } from "./src/lib/server/styleCsp.js";

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter({ precompress: true }),
      // `auto` nonces SSR scripts/styles and hashes prerendered ones.
      csp: {
        mode: "auto",
        directives: {
          "default-src": ["self"],
          "script-src": ["self"],
          "style-src": ["self"],
          // Only reviewed, fixed SSR declarations; dynamic UI uses trusted CSSOM writes.
          "style-src-attr": ["unsafe-hashes", ...STYLE_ATTRIBUTE_HASHES],
          "img-src": ["self", "data:", "blob:"],
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
