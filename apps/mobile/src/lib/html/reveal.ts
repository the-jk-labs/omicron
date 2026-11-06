import type { Block, Inline } from "./parse";

// Roughly the characters of body text worth mounting at once: a few screens' worth on a phone. A native stack can't
// start its slide-in until the first commit lands, so that commit must stay small however long the post is.
const STEP_BUDGET = 1500;

// What the other kinds cost in the same unit. A formula is by far the worst: dozens of SVG nodes, drawn on the UI thread.
const FORMULA = 300;
const IMAGE = 600;
const CODE = 200;

function inlineCost(items: Inline[]): number {
  let cost = 0;
  for (const item of items) {
    if (item.type === "text") cost += item.text.length;
    else if (item.type === "math") cost += FORMULA;
    else if (item.type === "image") cost += IMAGE;
  }
  return cost;
}

const blocksCost = (blocks: Block[]) => blocks.reduce((sum, block) => sum + blockCost(block), 0);

function blockCost(block: Block): number {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return inlineCost(block.children);
    case "blockquote":
      return blocksCost(block.children);
    case "list":
      return block.items.reduce((sum, item) => sum + blocksCost(item), 0);
    case "code":
      return CODE + block.code.length;
    case "image":
      return IMAGE;
    case "table":
      return block.rows.reduce((sum, row) => sum + row.cells.reduce((inner, cell) => inner + blocksCost(cell), 0), 0);
    case "details":
      // Its body only mounts once opened.
      return inlineCost(block.summary);
    case "math":
      return FORMULA;
    default:
      return 0;
  }
}

/** How many top-level blocks to show at each step, ending with all of them. */
export function revealSteps(blocks: Block[]): number[] {
  const steps: number[] = [];
  let spent = 0;
  blocks.forEach((block, index) => {
    spent += blockCost(block);
    if (spent >= STEP_BUDGET) {
      steps.push(index + 1);
      spent = 0;
    }
  });
  if (steps.at(-1) !== blocks.length) steps.push(blocks.length);
  return steps;
}
