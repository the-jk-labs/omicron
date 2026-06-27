// SPDX-License-Identifier: AGPL-3.0-or-later
import { tick } from "svelte";

// Insert a picked Unicode emoji into a plain text field at the caret (replacing
// any selection), clamped to the field's max length, then restore focus and put
// the caret right after the inserted emoji. Shared by every place that overlays
// an emoji button on a native <input>/<textarea> (settings, comments, …).
export async function insertEmojiIntoField(
  el: HTMLInputElement | HTMLTextAreaElement | null,
  current: string,
  max: number,
  emoji: string,
  set: (value: string) => void,
): Promise<void> {
  const start = el?.selectionStart ?? current.length;
  const end = el?.selectionEnd ?? current.length;
  set((current.slice(0, start) + emoji + current.slice(end)).slice(0, max));
  await tick();
  if (!el) return;
  const caret = Math.min(start + emoji.length, max);
  el.focus();
  el.setSelectionRange(caret, caret);
}

// Smile button overlaid inside a field; the caller positions it (e.g. bottom-2
// right-1.5 for a textarea, or centred for a one-line input).
export const emojiOverlayBtn =
  "text-muted-foreground hover:bg-muted hover:text-foreground absolute inline-flex size-8 items-center justify-center rounded-button transition-colors";
