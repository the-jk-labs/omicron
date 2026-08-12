// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Regenerates src/lib/brandIcons.ts — the language logos on a code block's
// filename chip — from Simple Icons.
//
//   pnpm add -D simple-icons && node scripts/gen-brand-icons.mjs && pnpm rm simple-icons
//
// or, to leave the lockfile alone entirely, install it anywhere and point the
// script at it:
//
//   node scripts/gen-brand-icons.mjs /tmp/si/node_modules/simple-icons/index.mjs
//
// The dependency is temporary on purpose. Simple Icons is a 26 MB package of
// ~3,000 logos; we want fifty of them, they change about never, and a runtime
// dependency that size is not something to hand every operator who builds this
// app. So the paths are copied in, with this script as their provenance.
//
// Licence: the icon paths are CC0-1.0 (Simple Icons). The trademarks they
// depict belong to their respective owners and are used here to identify the
// language a code block is written in — nominative use, no endorsement implied.

import { writeFile } from "node:fs/promises";

// The languages and formats people write posts about. A slug missing from
// Simple Icons — C#, Java and PowerShell are all absent, their owners having
// asked to be removed — simply gets no logo, and lib/fileIcons.ts falls back to
// the lettered chip it drew before any of this existed.
const SLUGS = [
  "typescript",
  "javascript",
  "react",
  "python",
  "rust",
  "go",
  "ruby",
  "php",
  "kotlin",
  "swift",
  "dart",
  "elixir",
  "erlang",
  "haskell",
  "lua",
  "r",
  "perl",
  "scala",
  "zig",
  "clojure",
  "julia",
  "nim",
  "crystal",
  "ocaml",
  "fortran",
  "solidity",
  "c",
  "cplusplus",
  "graphql",
  "gnubash",
  "yaml",
  "toml",
  "markdown",
  "html5",
  "css",
  "sass",
  "less",
  "svelte",
  "vuedotjs",
  "astro",
  "docker",
  "git",
  "terraform",
  "prisma",
];

const icons = await import(process.argv[2] ?? "simple-icons");
const exportName = (slug) => `si${slug[0].toUpperCase()}${slug.slice(1)}`;

const entries = [];
const missing = [];
for (const slug of SLUGS) {
  const icon = icons[exportName(slug)];
  if (!icon) {
    missing.push(slug);
    continue;
  }
  entries.push({ slug, title: icon.title, path: icon.path });
}
const body = entries.map(({ slug, title, path }) => `  // ${title}\n  ${slug}: ${JSON.stringify(path)},`).join("\n");

const file = `// SPDX-License-Identifier: AGPL-3.0-or-later
//
// GENERATED FILE — do not edit by hand. Run scripts/gen-brand-icons.mjs.
//
// Language logos for the chip beside a code block's filename, as the single
// \`d\` of a 24×24 path. They are drawn in the chip's tone rather than the brand's
// own colour: at 18px a two-tone mark is mud, and the tint keeps the chip
// legible in both themes (see .code-icon in app.css).
//
// Source: Simple Icons (https://simpleicons.org), paths licensed CC0-1.0. The
// trademarks they depict belong to their owners and identify the language a
// block is written in; no endorsement is implied.

/** Simple Icons slug → the path data of its 24×24 mark. */
export const BRAND_ICONS: Readonly<Record<string, string>> = {
${body}
};
`;

await writeFile(new URL("../src/lib/brandIcons.ts", import.meta.url), file);
console.log(`wrote ${entries.length} icons`);
if (missing.length) console.log(`no logo published for: ${missing.join(", ")}`);
