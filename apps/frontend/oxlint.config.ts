import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "unicorn", "oxc", "eslint", "import", "promise"],
  categories: {
    suspicious: "warn",
  },
  options: {
    typeAware: true,
  },
  rules: {
    eqeqeq: "warn",
    "no-throw-literal": "warn",
    "import/no-unassigned-import": ["warn", { allow: ["**/app.css", "@testing-library/jest-dom/vitest"] }],
    "unicorn/prefer-node-protocol": "warn",
    "typescript/consistent-type-imports": "warn",
  },
  overrides: [
    {
      files: ["**/*.svelte"],
      rules: {
        "no-unused-expressions": "off",
      },
    },
  ],
});
