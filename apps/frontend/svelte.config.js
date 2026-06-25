import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // adapter-node → `node build` in the Docker image. Stateless server.
    // `precompress` emits .gz/.br alongside every static asset (JS/CSS/etc.) so
    // the server ships them compressed without a reverse proxy — cuts the
    // render-blocking CSS and JS transfer sizes.
    adapter: adapter({ precompress: true }),
  },
};

export default config;
