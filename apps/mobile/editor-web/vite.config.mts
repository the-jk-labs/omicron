import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const from = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Builds the WebView half of the composer into one HTML file (see `pnpm editor:build`).
export default defineConfig({
  root: from("."),
  build: { outDir: "build", emptyOutDir: true },
  resolve: {
    alias: [
      // The WebView must never load React Native code: TenTap's web build stands in for it.
      { find: /^@10play\/tentap-editor$/, replacement: "@10play/tentap-editor/web" },
      { find: /^@tiptap\/pm\/(view|state)$/, replacement: "@10play/tentap-editor/web" },
      // The web app's own editor setup, reused unchanged.
      { find: /^#lib\//, replacement: from("../../frontend/src/lib/") },
      { find: /^@\//, replacement: from("../src/") },
    ],
    // One copy of each, resolved from this app, even for files imported from apps/frontend.
    dedupe: [
      "@tiptap/core",
      "@tiptap/pm",
      "@tiptap/starter-kit",
      "@tiptap/extension-link",
      "@tiptap/extension-table",
      "@tiptap/extension-image",
      "@tiptap/extension-placeholder",
      "tiptap-markdown",
      "react",
      "react-dom",
    ],
  },
  plugins: [react(), viteSingleFile()],
  server: { port: 3000 },
});
