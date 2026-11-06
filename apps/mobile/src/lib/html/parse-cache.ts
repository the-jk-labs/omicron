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

// A parse can't be interrupted, so a very long body would stall the thread for a post that may never be opened.
const LONG_BODY = 50_000;
// Cards scrolled past fall off the front, so a fast fling doesn't leave a backlog of posts no longer on screen.
const MAX_WAITING = 8;

const queue: string[] = [];
let scheduled = false;

/** Parses `html` when the JS thread is idle, one body per idle slot, so opening the post skips the parse. */
export function parseWhenIdle(html: string) {
  if (!html || html.length > LONG_BODY || isParsed(html) || queue.includes(html)) return;
  queue.push(html);
  if (queue.length > MAX_WAITING) queue.shift();
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
