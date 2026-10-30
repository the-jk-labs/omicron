import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  resolve: {
    alias: [
      { find: /^@\//, replacement: fromRoot("./src/") },
      // react-native ships Flow source that Vite can't transform, so tests run against light stand-ins.
      { find: /^react-native$/, replacement: fromRoot("./tests/support/react-native.tsx") },
      { find: /^react-native-mmkv$/, replacement: fromRoot("./tests/support/react-native-mmkv.ts") },
    ],
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    fsModuleCache: true,
    mockReset: true,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
    },
  },
});
