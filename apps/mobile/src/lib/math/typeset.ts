import type { LiteElement } from "mathjax-full/js/adaptors/lite/Element.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { MathML } from "mathjax-full/js/input/mathml.js";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { SVG } from "mathjax-full/js/output/svg.js";

// Formulas used to be one WebView each, and a post with dozens of them stuttered on every scroll. MathJax's
// lite DOM typesets MathML to plain SVG paths in JS, which react-native-svg draws natively.

/** A typeset formula. Sizes are in em, so it scales with the text it sits in. */
export type TypesetMath = { svg: string; width: number; height: number; depth: number };

// `convert` returns the `<mjx-container>` holding the SVG.
type Engine = (mathml: string, display: boolean) => string;

let engine: Engine | undefined;

function getEngine(): Engine {
  if (!engine) {
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    // No font cache: each SVG then carries its own glyph paths instead of <use> links into a shared sheet.
    const doc = mathjax.document("", { InputJax: new MathML(), OutputJax: new SVG({ fontCache: "none" }) });
    engine = (mathml, display) => {
      const container: LiteElement = doc.convert(mathml, { display });
      return adaptor.innerHTML(container);
    };
  }
  return engine;
}

const cache = new Map<string, TypesetMath | null>();

/** MathML to SVG, or null when it can't be typeset. Results are cached, so a re-render costs nothing. */
export function typesetMath(mathml: string, display: boolean): TypesetMath | null {
  if (!mathml.trim()) return null;
  const key = `${display ? "D" : "I"}${mathml}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  let result: TypesetMath | null = null;
  try {
    result = fromSvg(getEngine()(mathml, display));
  } catch {
    result = null;
  }
  cache.set(key, result);
  return result;
}

function fromSvg(markup: string): TypesetMath | null {
  // MathJax's viewBox is in thousandths of an em with the baseline at y = 0.
  const viewBox = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(markup);
  if (!viewBox) return null;
  const [minY, width, height] = [Number(viewBox[2]), Number(viewBox[3]), Number(viewBox[4])];
  if (markup.includes('data-mml-node="merror"')) return null;
  const svg = markup
    // Sized by the caller; the rest is DOM bookkeeping that only slows react-native-svg's parser.
    .replace(/ (?:width|height|style|role|focusable)="[^"]*"/g, (match, offset: number) =>
      offset < markup.indexOf(">") ? "" : match,
    )
    .replace(/ data-[\w-]+="[^"]*"/g, "");
  return { svg, width: width / 1000, height: height / 1000, depth: (minY + height) / 1000 };
}
