import { excerpt, readTime } from "@/lib/format";

// Both walk the whole body with regexes, and a recycled list cell recomputes them for each post it shows.
const KEEP = 200;

function remembered<T>(compute: (html: string) => T) {
  const results = new Map<string, T>();
  return (html: string): T => {
    const hit = results.get(html);
    if (hit !== undefined) {
      // Least recently used goes first, so a hit moves to the back.
      results.delete(html);
      results.set(html, hit);
      return hit;
    }
    const result = compute(html);
    if (results.size >= KEEP) results.delete(results.keys().next().value!);
    results.set(html, result);
    return result;
  };
}

/** `excerpt`, remembered for recent post bodies. */
export const postExcerpt = remembered((html) => excerpt(html));

/** `readTime`, remembered for recent post bodies. */
export const postReadTime = remembered(readTime);
