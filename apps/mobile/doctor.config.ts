import { defineConfig } from "react-doctor/api";

export default defineConfig({
  ignore: {
    files: ["oxlint-rules/**", "editor-web/**"],
    rules: [
      // Every flagged padding is a safe-area or tab-bar inset: fixed per device, so there is no reflow to avoid
      // (the rule's own docs reject that case), and contentInset would be iOS-only.
      "react-doctor/rn-scrollview-dynamic-padding",
      // `finally` stops the React Compiler optimising a component (AGENTS.md), so busy flags reset on both paths.
      "react-doctor/no-loading-flag-reset-outside-finally",
    ],
    overrides: [
      {
        // A post body parsed once into a static tree: never reordered, filtered or edited, so position is identity.
        files: ["src/components/reader/html-content.tsx"],
        rules: ["react-doctor/no-array-index-as-key"],
      },
    ],
  },
});
