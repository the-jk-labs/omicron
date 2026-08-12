// SPDX-License-Identifier: AGPL-3.0-or-later

// The languages a code block can declare, and what to call them.
//
// Shared by the two ends of the same feature: the editor's code block dialog
// offers this list, and the reader (lib/highlight.ts) uses it to caption a
// block with the language its author declared.

/**
 * The languages offered in the code block dialog.
 *
 * Each value is a name highlight.js knows (it is what ends up in
 * `class="language-…"` and what the reader highlights with) and that
 * lib/fileIcons.ts can resolve to a mark. The list is the common bundle's
 * useful half rather than all ~190: an author whose language is missing can
 * still name the file `main.nim` and get both the highlighting and the mark
 * from the extension.
 */
export const CODE_LANGUAGES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "typescript", label: "TypeScript" },
  { value: "tsx", label: "TSX" },
  { value: "javascript", label: "JavaScript" },
  { value: "jsx", label: "JSX" },
  { value: "python", label: "Python" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "java", label: "Java" },
  { value: "kotlin", label: "Kotlin" },
  { value: "swift", label: "Swift" },
  { value: "csharp", label: "C#" },
  { value: "cpp", label: "C++" },
  { value: "c", label: "C" },
  { value: "ruby", label: "Ruby" },
  { value: "php", label: "PHP" },
  { value: "elixir", label: "Elixir" },
  { value: "haskell", label: "Haskell" },
  { value: "lua", label: "Lua" },
  { value: "dart", label: "Dart" },
  { value: "scala", label: "Scala" },
  { value: "r", label: "R" },
  { value: "perl", label: "Perl" },
  { value: "sql", label: "SQL" },
  { value: "graphql", label: "GraphQL" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "scss", label: "SCSS" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "toml", label: "TOML" },
  { value: "markdown", label: "Markdown" },
  { value: "bash", label: "Shell" },
  { value: "powershell", label: "PowerShell" },
  { value: "dockerfile", label: "Dockerfile" },
  { value: "diff", label: "Diff" },
  { value: "xml", label: "XML" },
  { value: "plaintext", label: "Plain text" },
];

// What a Markdown fence writes when it does not use the canonical name.
// highlight.js accepts all of these as aliases; the caption should read the
// same whichever one the author typed.
const ALIASES: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  kt: "kotlin",
  cs: "csharp",
  "c++": "cpp",
  cxx: "cpp",
  golang: "go",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  ps1: "powershell",
  yml: "yaml",
  jsonc: "json",
  md: "markdown",
  mdx: "markdown",
  docker: "dockerfile",
  patch: "diff",
  text: "plaintext",
  txt: "plaintext",
};

const LABELS: ReadonlyMap<string, string> = new Map(CODE_LANGUAGES.map((lang) => [lang.value, lang.label]));

/**
 * A declared language as a reader should see it — "TypeScript", not "ts".
 *
 * An unlisted language is title-cased rather than dropped: someone writing
 * ```nim should see "Nim" above their block, not nothing.
 */
export function codeLanguageLabel(language: string): string {
  const name = language.trim().toLowerCase();
  if (!name) return "";
  const canonical = ALIASES[name] ?? name;
  return LABELS.get(canonical) ?? canonical.charAt(0).toUpperCase() + canonical.slice(1);
}
