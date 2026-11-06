/** What stays mounted: everything already mounted that still exists, plus the pages either side of the current one. */
export function pagesToKeep<T>(pages: readonly T[], index: number, mounted: ReadonlySet<T>): Set<T> {
  return new Set(pages.filter((page, position) => mounted.has(page) || Math.abs(position - index) <= 1));
}

export type TabLayout = { x: number; width: number };

/**
 * Where a tab underline sits at a pager's `position` in pages: between two tabs, part way from one's place and width
 * to the other's. `inset` shortens it to the middle of the tab.
 */
export function markerAt(position: number, layouts: readonly TabLayout[], inset: number): TabLayout {
  "worklet";
  const last = layouts.length - 1;
  const clamped = Math.min(Math.max(position, 0), last);
  const index = Math.floor(clamped);
  const from = layouts[index];
  const to = layouts[Math.min(index + 1, last)];
  const part = clamped - index;
  const x = from.x + (to.x - from.x) * part;
  const width = from.width + (to.width - from.width) * part;
  return { x: x + width * inset, width: width * (1 - 2 * inset) };
}
