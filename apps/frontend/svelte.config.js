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

    // Content-Security-Policy. `auto` makes SvelteKit hash/nonce its own inline
    // hydration script, so we can keep `script-src 'self'` with NO
    // `unsafe-inline` — an injected inline <script> (e.g. from any future
    // sanitizer bypass in rendered post HTML) simply won't execute. Styles keep
    // `unsafe-inline` because components and third-party web components (the
    // emoji picker) emit inline styles; script execution is the XSS lever that
    // matters. Images allow remote http/https so federated avatars/embeds load.
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
  },
};

export default config;
