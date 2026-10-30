import { describe, expect, test } from "vitest";
import { parseHtml } from "@/lib/html/parse";
import { typesetMath } from "@/lib/math/typeset";

// As the backend sends it: KaTeX's MathML with the TeX source as an annotation.
const INLINE =
  '<p>Decay time <span class="katex"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><msub><mi>τ</mi><mi>e</mi></msub></mrow><annotation encoding="application/x-tex">\\tau_e</annotation></semantics></math></span>.</p>';
const DISPLAY =
  '<p class="katex-block"><span class="katex"><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><semantics><mrow><mfrac><mn>1</mn><mn>2</mn></mfrac></mrow><annotation encoding="application/x-tex">\\frac12</annotation></semantics></math></span></p>';

function formulaOf(html: string) {
  const [block] = parseHtml(html);
  if (block?.type === "math") return block;
  if (block?.type === "paragraph") {
    const math = block.children.find((child) => child.type === "math");
    if (math) return math;
  }
  throw new Error("no formula");
}

describe("typesetMath", () => {
  test("an inline formula becomes an SVG sized in em, with depth below the baseline", () => {
    const math = typesetMath(formulaOf(INLINE).mathml, false);
    expect(math).not.toBeNull();
    expect(math!.svg).toMatch(/^<svg [^>]*viewBox="/);
    expect(math!.svg).toContain("<path");
    expect(math!.width).toBeGreaterThan(0.5);
    expect(math!.width).toBeLessThan(3);
    expect(math!.height).toBeGreaterThan(0.5);
    // The subscript hangs below the baseline.
    expect(math!.depth).toBeGreaterThan(0);
    expect(math!.depth).toBeLessThan(math!.height);
  });

  test("the root is sized by the caller, inner shapes keep their sizes, and bookkeeping attributes go", () => {
    const math = typesetMath(formulaOf(DISPLAY).mathml, true)!;
    const root = math.svg.slice(0, math.svg.indexOf(">"));
    expect(root).not.toMatch(/ (width|height|style)=/);
    // A fraction bar is a <rect> with its own width and height.
    expect(math.svg).toMatch(/<rect [^>]*width="/);
    expect(math.svg).not.toContain("data-");
    expect(math.svg).toContain('fill="currentColor"');
  });

  test("the TeX annotation isn't drawn", () => {
    const formula = formulaOf(INLINE);
    expect(formula.mathml).not.toContain("annotation");
    expect(typesetMath(formula.mathml, false)!.svg).not.toContain("tau");
  });

  test("results are cached", () => {
    const { mathml } = formulaOf(INLINE);
    expect(typesetMath(mathml, false)).toBe(typesetMath(mathml, false));
  });

  test("markup that isn't MathML gives null instead of throwing", () => {
    expect(typesetMath("<div>not maths</div>", false)).toBeNull();
    expect(typesetMath("", true)).toBeNull();
  });
});
