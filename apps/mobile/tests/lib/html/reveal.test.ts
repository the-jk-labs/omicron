import { describe, expect, test } from "vitest";
import type { Block } from "@/lib/html/parse";
import { revealSteps } from "@/lib/html/reveal";

const marks = {};
const paragraph = (length: number): Block => ({
  type: "paragraph",
  children: [{ type: "text", text: "a".repeat(length), marks }],
});
const formula: Block = { type: "math", mathml: "<math></math>", tex: "x", display: true };
const many = (block: Block, count: number) => Array.from({ length: count }, () => block);

describe("revealSteps", () => {
  test("a short post is one step", () => {
    expect(revealSteps([paragraph(100), paragraph(100)])).toEqual([2]);
  });

  test("a long post is cut by the amount of text, ending with everything", () => {
    expect(revealSteps(many(paragraph(500), 7))).toEqual([3, 6, 7]);
  });

  test("always ends on the last block without a repeat", () => {
    expect(revealSteps(many(paragraph(500), 6))).toEqual([3, 6]);
  });

  test("formulas count for far more than their source", () => {
    expect(revealSteps(many(formula, 10))).toEqual([5, 10]);
  });

  test("inline formulas count too", () => {
    const withMath: Block = {
      type: "paragraph",
      children: [{ type: "math", mathml: "<math></math>", tex: "x" }],
    };
    expect(revealSteps(many(withMath, 10))).toEqual([5, 10]);
  });

  test("a single huge block is still one step, not lost", () => {
    expect(revealSteps([paragraph(9000)])).toEqual([1]);
    expect(revealSteps([paragraph(9000), paragraph(10)])).toEqual([1, 2]);
  });

  test("nested content counts", () => {
    const list: Block = { type: "list", ordered: false, start: 1, items: [[paragraph(1000)], [paragraph(1000)]] };
    const quote: Block = { type: "blockquote", children: [paragraph(1600)] };
    const table: Block = { type: "table", rows: [{ header: false, cells: [[paragraph(800)], [paragraph(800)]] }] };
    expect(revealSteps([list, paragraph(1)])).toEqual([1, 2]);
    expect(revealSteps([quote, paragraph(1)])).toEqual([1, 2]);
    expect(revealSteps([table, paragraph(1)])).toEqual([1, 2]);
  });

  test("code and images have a cost of their own", () => {
    const code: Block = { type: "code", code: "x", language: null, title: null };
    const image: Block = { type: "image", src: "a", alt: "", widthPercent: null };
    expect(revealSteps(many(code, 8))).toEqual([8]);
    expect(revealSteps(many(image, 3))).toEqual([3]);
  });

  test("a closed details block only costs its summary", () => {
    const details: Block = {
      type: "details",
      summary: [{ type: "text", text: "More", marks }],
      children: [paragraph(9000)],
    };
    expect(revealSteps([details, paragraph(1)])).toEqual([2]);
  });

  test("an empty post has one empty step", () => {
    expect(revealSteps([])).toEqual([0]);
  });
});
