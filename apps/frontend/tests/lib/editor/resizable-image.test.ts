// SPDX-License-Identifier: AGPL-3.0-or-later
import { Editor } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { afterEach, expect, test, vi } from "vitest";
import { EDIT_ALT_EVENT, type EditAltDetail, ResizableImage } from "#lib/editor/resizable-image.js";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function mount(img = '<img src="/a.png" alt="A cat" width="40%">') {
  const element = document.createElement("div");
  document.body.append(element);
  editor = new Editor({ element, extensions: [StarterKit, ResizableImage], content: img });
  const wrapper = element.querySelector<HTMLElement>(".img-resizer")!;
  return {
    editor,
    wrapper,
    frame: wrapper.querySelector<HTMLElement>(".img-resizer-frame")!,
    img: wrapper.querySelector("img")!,
    alt: wrapper.querySelector<HTMLButtonElement>(".img-alt-button")!,
    handle: (corner: string) => wrapper.querySelector<HTMLElement>(`[data-corner="${corner}"]`)!,
  };
}

const pointer = (type: string, clientX: number, button = 0) => new MouseEvent(type, { clientX, button, bubbles: true });

test("renders the image inside a frame sized to its width, with four handles", () => {
  const { frame, img, wrapper } = mount();
  expect(img.getAttribute("src")).toBe("/a.png");
  expect(img.alt).toBe("A cat");
  expect(frame.style.width).toBe("40%");
  expect(wrapper.querySelectorAll(".img-resize-handle")).toHaveLength(4);
  const full = mount('<img src="/b.png">');
  expect(full.frame.style.width).toBe("100%");
});

test("the alt button says whether alt text is missing", () => {
  const withAlt = mount();
  expect(withAlt.alt.dataset.missing).toBe("false");
  expect(withAlt.alt.getAttribute("aria-label")).toBe("Edit alt text: A cat");
  editor!.destroy();
  const without = mount('<img src="/a.png" alt="  ">');
  expect(without.alt.dataset.missing).toBe("true");
  expect(without.alt.title).toBe("Add alt text");
});

test("clicking the alt button asks the page to edit that image's alt text", () => {
  const { editor: e, alt } = mount();
  const listener = vi.fn<(ev: CustomEvent<EditAltDetail>) => void>();
  e.view.dom.addEventListener(EDIT_ALT_EVENT, listener as unknown as EventListener);
  alt.click();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener.mock.calls[0][0].detail).toEqual({ pos: 0, alt: "A cat" });
  e.setEditable(false);
  alt.click();
  expect(listener).toHaveBeenCalledTimes(1);
});

test("dragging a corner resizes in whole percent, clamped, and commits on release", () => {
  const { editor: e, wrapper, frame, handle } = mount();
  vi.spyOn(wrapper, "clientWidth", "get").mockReturnValue(500);
  vi.spyOn(frame, "offsetWidth", "get").mockReturnValue(200);

  handle("se").dispatchEvent(pointer("pointerdown", 100));
  expect(wrapper.classList.contains("is-resizing")).toBe(true);
  window.dispatchEvent(pointer("pointermove", 150));
  expect(frame.style.width).toBe("50%");
  window.dispatchEvent(pointer("pointermove", 1000));
  expect(frame.style.width).toBe("100%");
  window.dispatchEvent(pointer("pointerup", 1000));
  expect(wrapper.classList.contains("is-resizing")).toBe(false);
  expect(e.getHTML()).toContain('width="100%"');

  // A left-hand corner grows the other way, and never below 10%.
  handle("nw").dispatchEvent(pointer("pointerdown", 500));
  window.dispatchEvent(pointer("pointermove", 1000));
  window.dispatchEvent(pointer("pointerup", 1000));
  expect(e.getHTML()).toContain('width="10%"');
});

test("no resize from a non-primary button, a read-only editor or an unlaid-out column", () => {
  const { editor: e, wrapper, handle } = mount();
  handle("se").dispatchEvent(pointer("pointerdown", 0, 2));
  expect(wrapper.classList.contains("is-resizing")).toBe(false);
  handle("se").dispatchEvent(pointer("pointerdown", 0));
  expect(wrapper.classList.contains("is-resizing")).toBe(false);
  vi.spyOn(wrapper, "clientWidth", "get").mockReturnValue(500);
  e.setEditable(false);
  handle("se").dispatchEvent(pointer("pointerdown", 0));
  expect(wrapper.classList.contains("is-resizing")).toBe(false);
});

test("selection is reflected on the wrapper", () => {
  const { editor: e, wrapper } = mount();
  e.commands.setNodeSelection(0);
  expect(wrapper.classList.contains("is-selected")).toBe(true);
  e.commands.setTextSelection(0);
  expect(wrapper.classList.contains("is-selected")).toBe(false);
});

test("an attribute change re-renders the node view in place", () => {
  const { editor: e, img, alt } = mount();
  e.commands.setNodeSelection(0);
  e.commands.updateAttributes("image", { alt: "", title: "T" });
  expect(img.alt).toBe("");
  expect(img.title).toBe("T");
  expect(alt.dataset.missing).toBe("true");
  e.commands.updateAttributes("image", { title: null });
  expect(img.hasAttribute("title")).toBe(false);
});
