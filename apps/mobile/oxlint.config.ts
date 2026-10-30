import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "unicorn", "oxc", "import", "react", "react-perf", "vitest"],
  categories: {
    suspicious: "warn",
    correctness: "warn",
  },
  jsPlugins: [{ name: "expo", specifier: "eslint-plugin-expo" }, "./oxlint-rules/index.mjs"],
  options: {
    typeAware: true,
    typeCheck: true,
  },
  rules: {
    eqeqeq: "warn",
    "no-throw-literal": "warn",
    "react/no-unstable-nested-components": "off",
    "import/no-unassigned-import": ["warn", { allow: ["**/global.css"] }],
    "unicorn/prefer-node-protocol": "warn",
    "react/react-in-jsx-scope": "off",
    // expo-status-bar takes `style` as a string ("auto" | "light" | "dark").
    "react/style-prop-object": ["warn", { allow: ["StatusBar"] }],
    "typescript/consistent-type-imports": "warn",
    "expo/no-dynamic-env-var": "error",
    "expo/no-env-var-destructuring": "error",
    "expo/use-dom-exports": "error",
    "local/enforce-static-vector-icons": "error",
    // Pushes toward toSorted(), which Hermes lacks; local/no-hermes-unsupported guards the runtime instead.
    "unicorn/no-array-sort": "off",
  },
  overrides: [
    // Only src/ runs on Hermes; tests, configs and scripts run on Node.
    { files: ["src/**"], rules: { "local/no-hermes-unsupported": "error" } },
  ],
  ignorePatterns: ["src/types/**", "dist/**", "android/**", "ios/**", ".expo/**", ".agents/**", "uniwind-types.d.ts"],
});
