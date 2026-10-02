import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "unicorn", "oxc", "vitest", "eslint", "promise"],
  categories: {
    suspicious: "warn",
  },
  options: {
    typeAware: true,
    typeCheck: true,
  },
  rules: {
    "no-throw-literal": "warn",
    "vitest/expect-expect": ["warn", { assertFunctionNames: ["expect", "rejects", "drawn"] }],
    "unicorn/prefer-node-protocol": "warn",
    "typescript/consistent-type-imports": "warn",
    "typescript/no-unsafe-type-assertion": "off",
  },
  overrides: [
    {
      // Asserting on a mocked method (`expect(queue.add)`) is the whole point
      // of a spy; there is no `this` to lose.
      files: ["tests/**"],
      rules: { "typescript/unbound-method": "off" },
    },
  ],
});
