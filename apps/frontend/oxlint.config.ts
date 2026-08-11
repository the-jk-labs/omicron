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
    "import/no-unassigned-import": ["warn", { allow: ["**/app.css"] }],
    "unicorn/prefer-node-protocol": "warn",
    "typescript/consistent-type-imports": "warn",
  },
  overrides: [
    {
      // Referencing a reactive value on its own line inside `$effect` is the
      // Svelte 5 idiom for registering it as a dependency — not a dead
      // expression. oxlint can't see the reactivity, so disable the rule here.
      files: ["**/*.svelte"],
      rules: {
        "no-unused-expressions": "off",
      },
    },
  ],
});
