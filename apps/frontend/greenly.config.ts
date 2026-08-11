import { defineConfig } from "greenly";

export default defineConfig({
  name: "omicron-frontend",
  checks: [
    { name: "Oxfmt", command: "pnpm fmt:check", onFail: "pnpm fmt" },
    { name: "Svelte Check", command: "pnpm svelte-check" },
    { name: "Oxlint", command: "pnpm lint" },
    // { name: "Build", command: "pnpm build" },
  ],
});
