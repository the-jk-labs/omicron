import { defineConfig } from "greenly";
import { runAssetCheck } from "./scripts/checks";

export default defineConfig({
  name: "Omicron Mobile",
  checks: [
    { name: "TypeScript", command: "pnpm tsc --noEmit" },
    { name: "Editor bundle types", command: "pnpm tsc -p editor-web" },
    { name: "Oxfmt", command: "pnpm fmt:check", onFail: "pnpm fmt" },
    { name: "Oxlint", command: "pnpm lint" },
    { name: "Tests", command: "pnpm test" },
    { name: "Assets", command: runAssetCheck },
    // { name: "Expo Install", command: "pnpm expo install --check", optional: true },
    // { name: "Expo Doctor", command: "pnpm expo-doctor", optional: true },
  ],
});
