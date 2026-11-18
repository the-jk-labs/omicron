import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { reactNative } from "vitest-native";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// The preset only targets Vite's client environment, but tests run in the server one; compile them the same way.
const reactCompiler = reactCompilerPreset();
if (reactCompiler.rolldown) reactCompiler.rolldown.applyToEnvironmentHook = () => true;

export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompiler] }),
    // Real React Native JS with only the native layer mocked; Android because the app ships Android only.
    reactNative({ engine: "native", platform: "android" }),
  ],
  resolve: {
    alias: [{ find: /^@\//, replacement: fromRoot("./src/") }],
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    fsModuleCache: true,
    // Real React Native: a file's first render or typeset can pass 5 s on a loaded or cold-cache run (CI).
    testTimeout: 15_000,
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
