const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Whether two snapshots of a form's server values match. */
export const sameValues = <T extends object>(a: T, b: T) => same(a, b);

/**
 * A form's fields after the server's values move from `base` to `next` (refreshed in the background): a field the
 * person hasn't edited (still equal to `base`) takes the new value, and one they've edited keeps their edit.
 */
export function mergeUnedited<T extends Record<string, unknown>>(current: T, base: T, next: T): T {
  const merged = { ...current };
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (same(current[key], base[key])) merged[key] = next[key];
  }
  return merged;
}
