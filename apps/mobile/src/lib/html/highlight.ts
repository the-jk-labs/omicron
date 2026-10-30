import hljs from "highlight.js/lib/common";
import dart from "highlight.js/lib/languages/dart";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import elixir from "highlight.js/lib/languages/elixir";
import haskell from "highlight.js/lib/languages/haskell";
import powershell from "highlight.js/lib/languages/powershell";
import scala from "highlight.js/lib/languages/scala";
import { parseDocument } from "htmlparser2";

// Same grammars and detection rules as apps/frontend/src/lib/highlight.ts, so a block reads the same in both.
for (const [name, grammar] of [
  ["dart", dart],
  ["dockerfile", dockerfile],
  ["elixir", elixir],
  ["haskell", haskell],
  ["powershell", powershell],
  ["scala", scala],
] as const) {
  hljs.registerLanguage(name, grammar);
}

const MIN_AUTO_RELEVANCE = 6;
const SHELL_GRAMMARS = new Set(["bash", "shell"]);
const PROSE_WORDS =
  /\b(?:the|a|an|and|or|but|if|then|else|when|we|you|they|it|is|are|was|were|be|been|being|to|of|in|on|at|for|with|from|by|that|this|these|those|there|here|as|so|not|no|can|could|should|would|will|shall|may|might|must|do|does|did|have|has|had|our|your|their|its|his|her|my|me|us|them|he|she)\b/gi;

function readsAsProse(source: string): boolean {
  const words = source.match(/[a-zA-Z']+/g) ?? [];
  if (words.length < 3) return false;
  return (source.match(PROSE_WORDS) ?? []).length / words.length > 0.25;
}

/** The colour role of a token; matches the web's `--hl-*` groups. */
export type TokenTone = "comment" | "keyword" | "string" | "name" | "literal" | "type" | "deletion";

const TONES: Record<string, TokenTone> = {
  comment: "comment",
  quote: "comment",
  keyword: "keyword",
  "selector-tag": "keyword",
  subst: "keyword",
  doctag: "keyword",
  formula: "keyword",
  string: "string",
  regexp: "string",
  char: "string",
  addition: "string",
  title: "name",
  section: "name",
  "selector-id": "name",
  "selector-class": "name",
  number: "literal",
  literal: "literal",
  symbol: "literal",
  bullet: "literal",
  link: "literal",
  variable: "literal",
  "template-variable": "literal",
  attr: "literal",
  attribute: "literal",
  type: "type",
  built_in: "type",
  tag: "type",
  name: "type",
  params: "type",
  meta: "type",
  "selector-attr": "type",
  "selector-pseudo": "type",
  deletion: "deletion",
};

export type CodeToken = { text: string; tone?: TokenTone };

type Node = { type: string; data?: string; attribs?: Record<string, string>; children?: Node[] };

function toneOf(className: string | undefined): TokenTone | undefined {
  for (const name of className?.split(/\s+/) ?? []) {
    const tone = name.startsWith("hljs-") ? TONES[name.slice(5)] : undefined;
    if (tone) return tone;
  }
  return undefined;
}

function collect(nodes: Node[], tone: TokenTone | undefined, out: CodeToken[]) {
  for (const node of nodes) {
    if (node.type === "text") {
      const previous = out.at(-1);
      if (previous && previous.tone === tone) previous.text += node.data ?? "";
      else out.push({ text: node.data ?? "", tone });
    } else if (node.children) {
      collect(node.children, toneOf(node.attribs?.class) ?? tone, out);
    }
  }
}

/** highlight.js output (HTML) as coloured runs of text. */
function tokensFromHtml(html: string): CodeToken[] {
  const out: CodeToken[] = [];
  collect(parseDocument(html, { decodeEntities: true }).children, undefined, out);
  return out;
}

/**
 * Highlights a code block. The declared language wins; otherwise detection is used only when it is
 * confident, so prose in a fence stays plain. Never throws: a highlighter bug falls back to plain text.
 */
export function highlightCode(source: string, declared?: string | null): CodeToken[] {
  if (!source.trim()) return [{ text: source }];
  try {
    if (declared && hljs.getLanguage(declared)) {
      return tokensFromHtml(hljs.highlight(source, { language: declared, ignoreIllegals: true }).value);
    }
    const auto = hljs.highlightAuto(source);
    const confident =
      auto.relevance >= MIN_AUTO_RELEVANCE ||
      (!declared && SHELL_GRAMMARS.has(auto.language ?? "") && auto.relevance > 0 && !readsAsProse(source));
    return auto.language && confident ? tokensFromHtml(auto.value) : [{ text: source }];
  } catch {
    return [{ text: source }];
  }
}
