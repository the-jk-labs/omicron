import { defineConfig } from "greenly";

export default defineConfig({
  name: "omicron-backend",
  checks: [
    { name: "Type Check", command: "deno check" },
    { name: "Oxfmt", command: "pnpm fmt:check", onFail: "pnpm fmt" },
    { name: "Oxlint", command: "pnpm lint" },
    { name: "Vitest", command: "pnpm test" },
  ],
});
