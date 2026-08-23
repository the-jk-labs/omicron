import { defineConfig } from "oxfmt";

export default defineConfig({
  printWidth: 120,
  singleQuote: false,
  insertFinalNewline: true,
  sortImports: {
    newlinesBetween: false,
  },
  ignorePatterns: ["drizzle/**"],
});
