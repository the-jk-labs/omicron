import { parseDocument } from "htmlparser2";

// Post bodies are sanitized HTML (backend lib/sanitize.ts), so the tag set is small and known. This turns it
// into a tree of native-renderable blocks, once per post, so rendering is plain React Native.

export type Marks = {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  underline?: boolean;
  code?: boolean;
  kbd?: boolean;
  sub?: boolean;
  sup?: boolean;
  href?: string;
};

export type Inline =
  | { type: "text"; text: string; marks: Marks }
  | { type: "break" }
  | { type: "image"; src: string; alt: string }
  | Formula;

/** A formula as MathML (the backend renders TeX to MathML), with its TeX source for screen readers. */
export type Formula = { type: "math"; mathml: string; tex: string };

export type Block =
  | { type: "paragraph"; children: Inline[] }
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | { type: "blockquote"; children: Block[] }
  | { type: "list"; ordered: boolean; start: number; items: Block[][] }
  | { type: "code"; code: string; language: string | null; title: string | null }
  | { type: "image"; src: string; alt: string; widthPercent: number | null }
  | { type: "rule" }
  | { type: "table"; rows: { header: boolean; cells: Block[][] }[] }
  | { type: "details"; summary: Inline[]; children: Block[] }
  | (Formula & { display: true });

type Node = { type: string; name?: string; data?: string; attribs?: Record<string, string>; children?: Node[] };

const BLOCK_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "ul",
  "ol",
  "pre",
  "hr",
  "table",
  "details",
  "figure",
  "div",
  "section",
  "article",
]);

const HEADING_LEVELS = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 } as const;

const LANGUAGE_CLASS = /(?:^|\s)language-([\w+#.-]+)/i;

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (text: string) => escapeHtml(text).replace(/"/g, "&quot;");

/** Serializes a MathML subtree without its TeX annotation, which a renderer would otherwise print. */
function mathml(node: Node): string {
  if (node.type === "text") return escapeHtml(node.data ?? "");
  if (node.type !== "tag" || node.name === "annotation") return "";
  const attribs = Object.entries(node.attribs ?? {})
    .map(([key, value]) => ` ${key}="${escapeAttr(value)}"`)
    .join("");
  return `<${node.name}${attribs}>${(node.children ?? []).map(mathml).join("")}</${node.name}>`;
}

function findTag(node: Node, name: string): Node | undefined {
  if (node.type === "tag" && node.name === name) return node;
  for (const child of node.children ?? []) {
    const found = findTag(child, name);
    if (found) return found;
  }
  return undefined;
}

function formula(math: Node): Formula {
  const annotation = findTag(math, "annotation");
  return { type: "math", mathml: mathml(math), tex: annotation ? textOf(annotation).trim() : "" };
}

function textOf(node: Node): string {
  if (node.type === "text") return node.data ?? "";
  return (node.children ?? []).map(textOf).join("");
}

const isBlockNode = (node: Node) =>
  node.type === "tag" &&
  (BLOCK_TAGS.has(node.name ?? "") || (node.name === "math" && node.attribs?.display === "block"));

// An image with no text beside it stands as its own figure rather than inside a paragraph.
const isLoneImage = (node: Node, run: Node[]) =>
  node.type === "tag" && node.name === "img" && run.every((n) => n.type === "text" && !n.data?.trim());

function inlineMarks(name: string, attribs: Record<string, string>, marks: Marks): Marks {
  switch (name) {
    case "strong":
    case "b":
      return { ...marks, bold: true };
    case "em":
    case "i":
      return { ...marks, italic: true };
    case "s":
    case "del":
    case "strike":
      return { ...marks, strike: true };
    case "u":
      return { ...marks, underline: true };
    case "code":
      return { ...marks, code: true };
    case "kbd":
      return { ...marks, kbd: true };
    case "sub":
      return { ...marks, sub: true };
    case "sup":
      return { ...marks, sup: true };
    case "a":
      return attribs.href ? { ...marks, href: attribs.href } : marks;
    default:
      return marks;
  }
}

function inlines(nodes: Node[], marks: Marks = {}, out: Inline[] = []): Inline[] {
  for (const node of nodes) {
    if (node.type === "text") {
      const text = (node.data ?? "").replace(/\s+/g, " ");
      if (!text) continue;
      const previous = out.at(-1);
      if (previous?.type === "text" && sameMarks(previous.marks, marks)) previous.text += text;
      else out.push({ type: "text", text, marks });
    } else if (node.type === "tag") {
      if (node.name === "br") out.push({ type: "break" });
      else if (node.name === "img" && node.attribs?.src)
        out.push({ type: "image", src: node.attribs.src, alt: node.attribs.alt ?? "" });
      else if (node.name === "math") out.push(formula(node));
      else inlines(node.children ?? [], inlineMarks(node.name ?? "", node.attribs ?? {}, marks), out);
    }
  }
  return out;
}

function sameMarks(a: Marks, b: Marks) {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.strike === b.strike &&
    a.underline === b.underline &&
    a.code === b.code &&
    a.kbd === b.kbd &&
    a.sub === b.sub &&
    a.sup === b.sup &&
    a.href === b.href
  );
}

/** Trims the whitespace HTML collapses at the edges of a block. */
function trimInlines(items: Inline[]): Inline[] {
  const first = items[0];
  if (first?.type === "text") first.text = first.text.replace(/^\s+/, "");
  const last = items.at(-1);
  if (last?.type === "text") last.text = last.text.replace(/\s+$/, "");
  return items.filter((item) => item.type !== "text" || item.text.length > 0);
}

function paragraphFrom(nodes: Node[]): Block[] {
  const children = trimInlines(inlines(nodes));
  if (children.length === 0) return [];
  // An image alone in a paragraph is a figure, not inline text.
  if (children.length === 1 && children[0]?.type === "image") {
    return [{ type: "image", src: children[0].src, alt: children[0].alt, widthPercent: null }];
  }
  return [{ type: "paragraph", children }];
}

function widthPercent(attribs: Record<string, string>): number | null {
  const match = /(\d+(?:\.\d+)?)%/.exec(attribs.width ?? attribs.style ?? "");
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) && value > 0 && value <= 100 ? value : null;
}

function codeBlock(pre: Node, title: string | null): Block {
  const code = pre.children?.find((child) => child.type === "tag" && child.name === "code") ?? pre;
  const language = LANGUAGE_CLASS.exec(code.attribs?.class ?? "")?.[1]?.toLowerCase() ?? null;
  return {
    type: "code",
    code: textOf(code).replace(/\n$/, ""),
    language,
    title: pre.attribs?.["data-title"] || title,
  };
}

function tableRows(node: Node, rows: { header: boolean; cells: Block[][] }[] = []) {
  for (const child of node.children ?? []) {
    if (child.type !== "tag") continue;
    if (child.name === "tr") {
      const cells = (child.children ?? []).filter(
        (cell) => cell.type === "tag" && (cell.name === "td" || cell.name === "th"),
      );
      rows.push({
        header: cells.every((cell) => cell.name === "th"),
        cells: cells.map((cell) => blocks(cell.children ?? [])),
      });
    } else {
      tableRows(child, rows);
    }
  }
  return rows;
}

function block(node: Node): Block[] {
  const name = node.name ?? "";
  const attribs = node.attribs ?? {};
  const children = node.children ?? [];
  switch (name) {
    case "p": {
      // Display maths arrives as `<p class="katex-block"><span class="katex"><math display="block">`.
      const display = attribs.class?.split(/\s+/).includes("katex-block") ? findTag(node, "math") : undefined;
      return display ? [{ ...formula(display), display: true }] : paragraphFrom(children);
    }
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return [{ type: "heading", level: HEADING_LEVELS[name], children: trimInlines(inlines(children)) }];
    case "blockquote":
      return [{ type: "blockquote", children: blocks(children) }];
    case "ul":
    case "ol":
      return [
        {
          type: "list",
          ordered: name === "ol",
          start: Number(attribs.start) || 1,
          items: children
            .filter((child) => child.type === "tag" && child.name === "li")
            .map((li) => blocks(li.children ?? [])),
        },
      ];
    case "pre":
      return [codeBlock(node, null)];
    case "hr":
      return [{ type: "rule" }];
    case "img":
      return attribs.src
        ? [{ type: "image", src: attribs.src, alt: attribs.alt ?? "", widthPercent: widthPercent(attribs) }]
        : [];
    case "table":
      return [{ type: "table", rows: tableRows(node) }];
    case "details": {
      const summary = children.find((child) => child.type === "tag" && child.name === "summary");
      return [
        {
          type: "details",
          summary: summary
            ? trimInlines(inlines(summary.children ?? []))
            : [{ type: "text", text: "Details", marks: {} }],
          children: blocks(children.filter((child) => child !== summary)),
        },
      ];
    }
    case "math":
      return [{ ...formula(node), display: true }];
    case "figure": {
      // A captioned code block (`figure.code-figure`) or an image with a caption.
      const pre = children.find((child) => child.type === "tag" && child.name === "pre");
      const caption = children.find((child) => child.type === "tag" && child.name === "figcaption");
      if (pre) return [codeBlock(pre, caption ? textOf(caption).trim() : null)];
      return blocks(children);
    }
    default:
      return blocks(children);
  }
}

/** Sequences of inline content between blocks become their own paragraphs. */
export function blocks(nodes: Node[]): Block[] {
  const out: Block[] = [];
  let run: Node[] = [];
  const flush = () => {
    if (run.length > 0) out.push(...paragraphFrom(run));
    run = [];
  };
  for (const node of nodes) {
    if (isBlockNode(node) || isLoneImage(node, run)) {
      flush();
      out.push(...block(node));
    } else if (node.type === "text" || node.type === "tag") {
      run.push(node);
    }
  }
  flush();
  return out;
}

/** Parses a sanitized post body into native-renderable blocks. */
export function parseHtml(html: string): Block[] {
  return blocks(parseDocument(html, { decodeEntities: true }).children);
}
