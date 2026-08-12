// SPDX-License-Identifier: AGPL-3.0-or-later

// Shrinks preformatted blocks until their longest line fits the column, so
// ASCII-art banners and wide code stay on one line instead of wrapping (which
// mangles art) or scrolling sideways.
//
// This exists because a profile's custom section renders in a ~600px column
// while the content is usually authored against a much wider canvas — a
// GitHub README is ~1500px, so a 90-column line that fits there does not fit
// here at the same size. Scaling the type is the only way to keep such a line
// intact and visible at once.
//
// Progressive enhancement: without JS the CSS leaves the block scrollable, and
// nothing is lost — this only ever makes the text smaller to avoid that.

// Below this the text stops being readable; a block that would need to go
// smaller wraps instead, which is the lesser evil.
const MIN_FONT_PX = 9;

function fitOne(pre: HTMLElement) {
  // Measure against the unwrapped, unscaled block: reset first, or each pass
  // would compound the previous pass's reduction.
  pre.style.whiteSpace = "pre";
  pre.style.fontSize = "";

  const styles = getComputedStyle(pre);
  const base = parseFloat(styles.fontSize);
  const padding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
  const available = pre.clientWidth - padding;
  const content = pre.scrollWidth - padding;
  if (!base || available <= 0 || content <= available) return;

  // A hair under the exact ratio: sub-pixel rounding in text layout can leave a
  // 1px overflow (and therefore a scrollbar) at the precise fit.
  const target = base * (available / content) * 0.99;
  if (target < MIN_FONT_PX) {
    // Too wide to shrink into readability — wrap instead of scrolling.
    pre.style.fontSize = `${MIN_FONT_PX}px`;
    pre.style.whiteSpace = "pre-wrap";
    return;
  }
  pre.style.fontSize = `${target}px`;
}

/**
 * Svelte action: fits every `<pre>` inside `node` to the available width, and
 * refits when the container resizes or the content changes.
 */
export function fitPre(node: HTMLElement) {
  const fitAll = () => {
    for (const pre of node.querySelectorAll("pre")) fitOne(pre);
  };

  // Web fonts land after first paint and change every measurement, so refit once
  // they're ready rather than sizing against the fallback metrics.
  if (document.fonts?.status !== "loaded") void document.fonts?.ready.then(fitAll);

  // Observing `node` (not each pre) covers both a column resize and a pre being
  // swapped in — the editor's preview replaces its content in place. Only width
  // matters: refitting on height would feed back on itself, since shrinking the
  // type changes the height.
  let lastWidth = 0;
  const resize = new ResizeObserver(() => {
    if (node.clientWidth === lastWidth) return;
    lastWidth = node.clientWidth;
    fitAll();
  });
  resize.observe(node);
  const mutation = new MutationObserver(fitAll);
  mutation.observe(node, { childList: true, subtree: true });

  fitAll();

  return {
    destroy() {
      resize.disconnect();
      mutation.disconnect();
    },
  };
}
