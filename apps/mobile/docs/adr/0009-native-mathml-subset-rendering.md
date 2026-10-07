# ADR-0009: Native MathML Subset Rendering

**Status:** Accepted

## Context

Post bodies carry KaTeX MathML (`output: "mathml"` in `apps/backend/src/lib/markdown.ts`): inline formulas inside paragraphs, display formulas in `p.katex-block`, and the TeX source in `annotation` with `katex-error` spans for unparseable input. The browser renders MathML natively; Compose has no MathML engine, and a WebView is excluded by the product boundary. No maintained KMP MathML-to-Compose renderer exists to depend on.

## Decision

Linearize the KaTeX MathML presentation subset into `AnnotatedString` in `commonMain`, rendered with the surrounding text style:

- Identifiers italic serif; numbers, operators, and text upright; scripts via baseline shift at 0.75em; fractions as numerator⁄denominator with U+2044; roots as √(…); matrices as [a, b; c, d]; binary operators space-padded with tight fences; display formulas centered in a horizontally scrolling block like the web `katex-block`.
- `katex-error` source renders monospace, matching the web fallback. A formula that linearizes to nothing falls back to its embedded TeX source in monospace; a formula with neither yields no block.
- Unsupported constructs are therefore always readable text, never a WebView, satisfying the R2 exit criterion up front.

## Consequences

- No new dependency; the subset is pure Kotlin and headless-testable against exact backend fixtures.
- Fidelity is linear, not typeset: stacked fractions, stretchy delimiters, and accents degrade to readable one-line forms.
- Widening the subset later is additive parser work with no model or API change.

## References

- R2 in `roadmap.md`
- `md.use(katex, { output: "mathml" })` in `apps/backend/src/lib/markdown.ts`
- `.prose-omicron p.katex-block`, `.prose-omicron math`, `.katex-error` in `apps/frontend/src/app.css`
- `MATHML_TAGS` in `apps/backend/src/lib/sanitize.ts`
