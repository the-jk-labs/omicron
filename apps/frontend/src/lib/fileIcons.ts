// SPDX-License-Identifier: AGPL-3.0-or-later

// The badge shown next to a code block's filename (```ts title="@/lib/name.ts").
//
// Two kinds of badge, in one shape. The languages a reader recognises on sight
// get their real mark — the TypeScript square, the Python coils, the Go gopher
// — from lib/brandIcons.ts. Everything else keeps the lettered chip: there is
// no logo for a `.env` or a `.diff`, and no vendor set covers whatever the next
// author reaches for, so the letters remain the floor rather than an absence.
//
// Both are drawn in the same tinted box, in the chip's tone rather than the
// brand's own colour. At 18px a two-tone mark is mud, and one palette keeps a
// caption from turning into a row of clashing stickers. The tone is a family
// hint, not an identity: what names the language is the mark, or the letters.
//
// This runs server-side (lib/highlight.ts, called from the post's load), so the
// path data never reaches a browser — only the one logo a block actually uses.

import { BRAND_ICONS } from "$lib/brandIcons";

/**
 * A resolved badge: which palette entry paints it, what it says, and — when the
 * language has a published mark — the path data to draw instead of the letters.
 */
export type FileIcon = { label: string; tone: Tone; path?: string };

export type Tone =
  | "blue"
  | "amber"
  | "green"
  | "orange"
  | "purple"
  | "red"
  | "cyan"
  | "slate";

// Extension → tone. The label is the extension itself unless LABELS overrides
// it, so adding a language here is usually a one-line change.
const TONES: Record<string, Tone> = {
  // Web / TypeScript
  ts: "blue",
  tsx: "blue",
  mts: "blue",
  cts: "blue",
  js: "amber",
  jsx: "amber",
  mjs: "amber",
  cjs: "amber",
  json: "amber",
  jsonc: "amber",
  html: "orange",
  htm: "orange",
  svelte: "orange",
  vue: "green",
  astro: "purple",
  css: "blue",
  scss: "blue",
  sass: "blue",
  less: "blue",

  // Systems
  c: "slate",
  h: "slate",
  cpp: "blue",
  cc: "blue",
  cxx: "blue",
  hpp: "blue",
  rs: "orange",
  go: "cyan",
  zig: "orange",
  swift: "orange",
  m: "slate",

  // Everything else people blog about
  py: "green",
  rb: "red",
  php: "purple",
  java: "red",
  kt: "purple",
  kts: "purple",
  cs: "purple",
  scala: "red",
  ex: "purple",
  exs: "purple",
  erl: "red",
  hs: "purple",
  lua: "blue",
  dart: "cyan",
  r: "blue",
  pl: "blue",
  sql: "cyan",
  graphql: "red",
  gql: "red",
  proto: "cyan",
  clj: "green",
  cljs: "green",
  jl: "purple",
  nim: "amber",
  cr: "slate",
  ml: "orange",
  mli: "orange",
  f90: "purple",
  f95: "purple",
  sol: "slate",
  tf: "purple",
  tfvars: "purple",
  prisma: "cyan",

  // Shells and config
  sh: "green",
  bash: "green",
  zsh: "green",
  fish: "green",
  ps1: "blue",
  yml: "slate",
  yaml: "slate",
  toml: "slate",
  ini: "slate",
  conf: "slate",
  env: "amber",
  md: "slate",
  mdx: "slate",
  txt: "slate",
  csv: "green",
  xml: "orange",
  diff: "green",
  patch: "green",
};

// Extension → the Simple Icons slug of the language's mark. An extension absent
// here, or present with no matching entry in BRAND_ICONS, falls through to the
// lettered chip — which is where C#, Java and PowerShell land, their owners
// having asked to be removed from that set.
const BRANDS: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  // A `.tsx`/`.jsx` file is a component, and the atom says so more directly
  // than the language square does.
  tsx: "react",
  jsx: "react",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  html: "html5",
  htm: "html5",
  svelte: "svelte",
  vue: "vuedotjs",
  astro: "astro",
  css: "css",
  scss: "sass",
  sass: "sass",
  less: "less",
  c: "c",
  h: "c",
  cpp: "cplusplus",
  cc: "cplusplus",
  cxx: "cplusplus",
  hpp: "cplusplus",
  rs: "rust",
  go: "go",
  zig: "zig",
  swift: "swift",
  py: "python",
  rb: "ruby",
  php: "php",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hs: "haskell",
  lua: "lua",
  dart: "dart",
  r: "r",
  pl: "perl",
  clj: "clojure",
  cljs: "clojure",
  jl: "julia",
  nim: "nim",
  cr: "crystal",
  ml: "ocaml",
  mli: "ocaml",
  f90: "fortran",
  f95: "fortran",
  sol: "solidity",
  tf: "terraform",
  tfvars: "terraform",
  prisma: "prisma",
  graphql: "graphql",
  gql: "graphql",
  sh: "gnubash",
  bash: "gnubash",
  zsh: "gnubash",
  fish: "gnubash",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  md: "markdown",
  mdx: "markdown",
};

// Where the extension is not what a reader would call the thing, or is too long
// to survive being cut to MAX_LABEL with its meaning intact ("SVEL").
const LABELS: Record<string, string> = {
  cxx: "C++",
  cpp: "C++",
  cc: "C++",
  hpp: "H++",
  ps1: "PS",
  graphql: "GQL",
  jsonc: "JSON",
  kts: "KT",
  exs: "EX",
  yaml: "YML",
  svelte: "SV",
  astro: "AST",
  scala: "SCA",
  proto: "PB",
  patch: "DIFF",
};

// Files people name without an extension, or whose extension is the whole name.
const FILENAMES: Record<string, FileIcon> = {
  dockerfile: { label: "DKR", tone: "cyan", path: BRAND_ICONS.docker },
  makefile: { label: "MK", tone: "slate" },
  rakefile: { label: "RB", tone: "red", path: BRAND_ICONS.ruby },
  gemfile: { label: "RB", tone: "red", path: BRAND_ICONS.ruby },
  procfile: { label: "CFG", tone: "slate" },
  ".gitignore": { label: "GIT", tone: "orange", path: BRAND_ICONS.git },
  ".gitattributes": { label: "GIT", tone: "orange", path: BRAND_ICONS.git },
  ".env": { label: "ENV", tone: "amber" },
  ".npmrc": { label: "CFG", tone: "slate" },
  ".editorconfig": { label: "CFG", tone: "slate" },
};

// highlight.js language names, for a title that carries no extension of its own
// (```ts title="The component"). Only the ones whose name is not already the
// extension need listing.
const LANGUAGE_EXTENSIONS: Record<string, string> = {
  typescript: "ts",
  javascript: "js",
  python: "py",
  ruby: "rb",
  rust: "rs",
  golang: "go",
  csharp: "cs",
  "c++": "cpp",
  objectivec: "m",
  kotlin: "kt",
  shell: "sh",
  console: "sh",
  powershell: "ps1",
  plaintext: "txt",
  dockerfile: "dockerfile",
  markdown: "md",
  yaml: "yml",
  perl: "pl",
  elixir: "ex",
  erlang: "erl",
  haskell: "hs",
  scss: "scss",
};

/** How wide a chip stays legible. Longer extensions are cut, not shrunk. */
const MAX_LABEL = 4;

// Deliberately strict. The filename arrives HTML-escaped (see lib/highlight.ts),
// so anything holding an entity — `&amp;` — simply fails to match and gets no
// badge, which is the right outcome for a filename that exotic and keeps
// unescaped text from ever reaching the label.
const EXTENSION = /\.([a-z0-9+#]{1,10})$/;
const BARE_NAME = /^\.?[a-z0-9_+#-]{1,40}$/;

function chip(extension: string): FileIcon | null {
  const tone = TONES[extension];
  if (!tone) return null;
  return withLogo({
    label: LABELS[extension] ?? extension.toUpperCase().slice(0, MAX_LABEL),
    tone,
  }, extension);
}

// The label is kept even when a logo is found: it is what the mark is labelled
// as for a screen reader, and what shows if the path is ever missing.
function withLogo(icon: FileIcon, extension: string): FileIcon {
  const path = BRAND_ICONS[BRANDS[extension] ?? ""];
  return path ? { ...icon, path } : icon;
}

/**
 * Resolve the badge for a code block, from its filename and failing that the
 * fence's language. Returns null when neither says anything recognisable — the
 * caption then shows the filename alone, exactly as it did before.
 *
 * `name` may be a path; only the last segment is read.
 */
export function fileIcon(name: string | null, language?: string | null): FileIcon | null {
  const base = (name ?? "").split(/[/\\]/).pop()?.trim().toLowerCase() ?? "";

  if (base) {
    const named = FILENAMES[base];
    if (named) return named;

    const extension = EXTENSION.exec(base)?.[1];
    if (extension) {
      const known = chip(extension);
      // An unknown extension still earns a neutral chip: "which language is
      // this" is answered by the letters, and the reader sees the same shape on
      // every block instead of one that comes and goes.
      if (known) return known;
      return { label: extension.toUpperCase().slice(0, MAX_LABEL), tone: "slate" };
    }

    // No extension, but a plain word (`Makefile.local` fails above, `README`
    // lands here) — nothing to say about it unless the fence declared one.
    if (!language && BARE_NAME.test(base)) return null;
  }

  const declared = (language ?? "").trim().toLowerCase();
  if (!declared) return null;
  const extension = LANGUAGE_EXTENSIONS[declared] ?? declared;
  // FILENAMES second: a few languages (Dockerfile) are named after a file
  // rather than an extension, so that is where their chip lives.
  return chip(extension) ?? FILENAMES[extension] ?? null;
}
