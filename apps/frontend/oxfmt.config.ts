import { defineConfig } from "oxfmt";

export default defineConfig({
  printWidth: 120,
  singleQuote: false,
  insertFinalNewline: true,
  sortTailwindcss: {
    config: "tailwind.config.ts",
    functions: ["clsx", "cn"],
    attributes: ["classNames", "tw"],
  },
  sortImports: {
    newlinesBetween: false,
  },
});
