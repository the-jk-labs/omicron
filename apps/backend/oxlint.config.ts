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
    // FIX THESE INCREMENTALLY - NOTE from Yusif, Not AI
    "typescript/no-unsafe-type-assertion": "off",
    "typescript/consistent-return": "off",
  },
});
