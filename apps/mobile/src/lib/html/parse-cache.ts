import { parseHtml, type Block } from "./parse";

// Parsed bodies of recent posts: the ones opened, and the ones feed cards parsed ahead while idle.
const KEEP = 40;
const parsed = new Map<string, Block[]>();

/** `parseHtml`, remembered for the most recently used bodies. */
export function parseCached(html: string): Block[] {
  const hit = parsed.get(html);
  if (hit) {
    // Least recently used goes first, so a hit moves to the back.
    parsed.delete(html);
    parsed.set(html, hit);
    return hit;
  }
  const blocks = parseHtml(html);
  if (parsed.size >= KEEP) parsed.delete(parsed.keys().next().value!);
  parsed.set(html, blocks);
  return blocks;
}

export const isParsed = (html: string) => parsed.has(html);

const queue: string[] = [];
let scheduled = false;

/** Parses `html` when the JS thread is idle, one body per idle slot, so opening the post skips the parse. */
export function parseWhenIdle(html: string) {
  if (!html || isParsed(html) || queue.includes(html)) return;
  queue.push(html);
  if (scheduled) return;
  scheduled = true;
  const step = () => {
    const next = queue.shift();
    if (next !== undefined && !isParsed(next)) parseCached(next);
    if (queue.length) requestIdleCallback(step);
    else scheduled = false;
  };
  requestIdleCallback(step);
}
