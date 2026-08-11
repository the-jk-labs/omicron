import { defineConfig } from "greenly";

export default defineConfig({
  name: "omicron-frontend",
  checks: [
    { name: "Oxfmt", command: "pnpm fmt:check", onFail: "pnpm fmt" },
    { name: "Oxlint", command: "pnpm lint" },
    { name: "Svelte Check", command: "pnpm svelte-kit sync && pnpm svelte-check --tsconfig ./tsconfig.json" },
    // { name: "Build", command: "pnpm build" },
  ],
});
