import type { Config } from "tailwindcss";

// Theme tokens ported verbatim from the Bits UI docs theme
// (docs/src/lib/styles/app.css). The docs use Tailwind v4 `@theme`; this is the
// v3 equivalent so the docs' example class strings resolve unchanged.
export default {
  darkMode: "class",
  content: ["./src/**/*.{html,js,svelte,ts}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background) / <alpha-value>)",
        "background-alt": "hsl(var(--background-alt) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        "foreground-alt": "hsl(var(--foreground-alt) / <alpha-value>)",
        muted: "hsl(var(--muted) / <alpha-value>)",
        "muted-foreground": "hsl(var(--muted-foreground))",
        dark: "hsl(var(--dark) / <alpha-value>)",
        "dark-10": "hsl(var(--dark-10))",
        "dark-40": "hsl(var(--dark-40))",
        "dark-04": "hsl(var(--dark-04))",
        accent: "hsl(var(--accent) / <alpha-value>)",
        "accent-foreground": "hsl(var(--accent-foreground) / <alpha-value>)",
        destructive: "hsl(var(--destructive) / <alpha-value>)",
        tertiary: "hsl(var(--tertiary) / <alpha-value>)",
        contrast: "hsl(var(--contrast) / <alpha-value>)",
        line: "hsl(var(--line) / <alpha-value>)",
        border: "hsl(var(--border-card))",
        "border-card": "hsl(var(--border-card))",
        input: "hsl(var(--border-input))",
        "border-input": "hsl(var(--border-input))",
      },
      borderRadius: {
        card: "16px",
        "card-lg": "20px",
        "card-sm": "10px",
        input: "9px",
        button: "5px",
        "5px": "5px",
        "9px": "9px",
        "10px": "10px",
        "15px": "15px",
      },
      boxShadow: {
        mini: "0px 1px 0px 1px rgba(0, 0, 0, 0.04)",
        "mini-inset": "0px 1px 0px 0px rgba(0, 0, 0, 0.04) inset",
        popover: "0px 7px 12px 3px rgba(24, 24, 27, 0.1)",
        kbd: "0px 2px 0px 0px rgba(0, 0, 0, 0.07)",
        btn: "0px 1px 0px 1px rgba(0, 0, 0, 0.03)",
        card: "0px 2px 0px 1px rgba(0, 0, 0, 0.04)",
      },
      fontSize: {
        xxs: "10px",
      },
      fontFamily: {
        // "Twemoji" leads both stacks but is unicode-range-scoped to emoji
        // codepoints (see @font-face in app.css), so it only ever supplies emoji
        // glyphs — text still renders with Inter/Georgia. This gives consistent
        // Twemoji artwork across every OS without touching stored content.
        sans: ["Twemoji", "Inter Variable", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        // Medium-like reading typography for rendered post content.
        serif: ["Twemoji", "Georgia", "Cambria", "Times New Roman", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
