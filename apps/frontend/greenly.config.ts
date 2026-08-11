import { defineConfig } from "greenly";

export default defineConfig({
  name: "omicron-frontend",
  checks: [
    { name: "TypeScript", command: "pnpm tsc --noEmit" },
    { name: "Oxfmt", command: "pnpm fmt:check", onFail: "pnpm fmt" },
    { name: "Svelte Sync", command: "pnpm svelte-kit sync" },
    { name: "Svelte Check", command: "pnpm svelte-check --tsconfig ./tsconfig.json" },
    // { name: "Build", command: "pnpm build" },
  ],
});
