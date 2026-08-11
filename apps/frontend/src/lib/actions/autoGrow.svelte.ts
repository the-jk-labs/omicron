// SPDX-License-Identifier: AGPL-3.0-or-later

// Grows a <textarea> to fit its content instead of scrolling a fixed box, so a
// long comment stays readable while it is being written.
//
// The field keeps its `rows` attribute as the floor (an empty box still looks
// like a comment box) and stops growing at MAX_HEIGHT_PX, after which it
// scrolls — otherwise a 2000-character response would push its own Respond
// button off the screen.

const MAX_HEIGHT_PX = 320;

/**
 * Svelte action: sizes `node` to its content whenever the bound value changes.
 *
 * The value is passed as a getter (`use:autoGrow={() => draft}`) because
 * programmatic writes — clearing after submit, inserting an emoji — do not fire
 * an `input` event, so listening to the element alone would miss them.
 */
export function autoGrow(node: HTMLTextAreaElement, value: () => string) {
  // Measured before anything is written to `style.height`, so this is the
  // height the `rows` attribute asked for.
  const floor = node.offsetHeight;
  // With `box-sizing: border-box` (Tailwind's default) `height` includes the
  // borders but `scrollHeight` does not, so the borders have to be added back
  // or the field would end up a couple of pixels short and scroll forever.
  const styles = getComputedStyle(node);
  const borders = parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth);

  function resize() {
    // Collapse first: `scrollHeight` never shrinks below the current height, so
    // without this the field could only ever get taller.
    node.style.height = "auto";
    const content = node.scrollHeight + borders;
    node.style.height = `${Math.max(floor, Math.min(content, MAX_HEIGHT_PX))}px`;
    node.style.overflowY = content > MAX_HEIGHT_PX ? "auto" : "hidden";
  }

  $effect(() => {
    value();
    resize();
  });

  // A narrower column re-wraps the text into more lines. Only width matters:
  // reacting to height would react to the resize this action just performed.
  $effect(() => {
    let width = node.clientWidth;
    const observer = new ResizeObserver(() => {
      if (node.clientWidth === width) return;
      width = node.clientWidth;
      resize();
    });
    observer.observe(node);
    return () => observer.disconnect();
  });
}
