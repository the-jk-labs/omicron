import { insertEmojiIntoField } from "$lib/emoji";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, vi } from "vitest";

function field(value: string, start: number, end = start) {
  const el = document.createElement("textarea");
  document.body.append(el);
  el.value = value;
  el.setSelectionRange(start, end);
  return el;
}

test("inserts at the caret, replacing a selection, and puts the caret after it", async () => {
  const el = field("hello world", 6, 11);
  const set = vi.fn<(v: string) => void>((v) => (el.value = v));
  await insertEmojiIntoField(el, "hello world", 100, "🎉", set);
  expect(set).toHaveBeenCalledWith("hello 🎉");
  expect(document.activeElement).toBe(el);
  expect([el.selectionStart, el.selectionEnd]).toEqual([8, 8]);
});

test("clamps the result to the field's maximum, and the caret with it", async () => {
  const el = field("abcd", 4);
  const set = vi.fn<(v: string) => void>((v) => (el.value = v));
  await insertEmojiIntoField(el, "abcd", 5, "🎉", set);
  // "🎉" is two UTF-16 units; the clamp is on code units, like maxlength.
  expect(set).toHaveBeenCalledWith("abcd\ud83c");
  expect(el.selectionStart).toBe(5);
});

test("without an element it appends and does nothing else", async () => {
  const set = vi.fn<(v: string) => void>();
  await insertEmojiIntoField(null, "hi", 10, "!", set);
  expect(set).toHaveBeenCalledWith("hi!");
});
