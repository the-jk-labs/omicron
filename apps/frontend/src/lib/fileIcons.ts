// SPDX-License-Identifier: AGPL-3.0-or-later

// The badge shown next to a code block's filename (```ts title="@/lib/name.ts").
//
// A monogram chip rather than a set of vendor logos: logos would mean shipping
// ~40 SVGs, each one somebody's trademark with its own licence, and they would
// still miss whatever language the next author reaches for. A two-letter chip
// covers every extension there is, reads at 9px, and costs no bytes.
//
// The tone is a hint, not an identity — languages that share a family share a
// colour. What tells the reader which language it is, is the letters.

/** A resolved badge: what it says, and which palette entry paints it. */
export type FileIcon = { label: string; tone: Tone };

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
  dockerfile: { label: "DKR", tone: "cyan" },
  makefile: { label: "MK", tone: "slate" },
  rakefile: { label: "RB", tone: "red" },
  gemfile: { label: "RB", tone: "red" },
  procfile: { label: "CFG", tone: "slate" },
  ".gitignore": { label: "GIT", tone: "orange" },
  ".gitattributes": { label: "GIT", tone: "orange" },
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
  return { label: LABELS[extension] ?? extension.toUpperCase().slice(0, MAX_LABEL), tone };
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
