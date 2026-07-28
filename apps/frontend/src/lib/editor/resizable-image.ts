// SPDX-License-Identifier: AGPL-3.0-or-later
import Image from "@tiptap/extension-image";

// The stock Tiptap image node is fixed-width. This extension adds a `width`
// attribute plus a node view that draws four corner handles, so an author can
// drag an image to the size they want.
//
// The width is stored as a *percentage* of the reading column, not pixels, for
// two reasons: it stays correct on every screen size, and it rides on the plain
// `width` attribute — which the backend sanitizer already allows on `img` (see
// lib/sanitize.ts). Inline styles are stripped there, so a `style="width:…"`
// would silently vanish on save.
//
// Height is never stored: the image keeps its own aspect ratio (`h-auto` in
// app.css), so dragging a corner scales both edges together.

// Never let an image shrink to something unclickable, and never past the column.
const MIN_PERCENT = 10;
const MAX_PERCENT = 100;

type Corner = "nw" | "ne" | "sw" | "se";
const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute("width"),
        renderHTML: (attributes) =>
          attributes.width ? { width: attributes.width as string } : {},
      },
    };
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      // wrapper (full column, centres the frame)
      //   └ frame (hugs the image, carries the width and the handles)
      //       └ img
      const wrapper = document.createElement("div");
      wrapper.className = "img-resizer";

      const frame = document.createElement("div");
      frame.className = "img-resizer-frame";
      wrapper.appendChild(frame);

      const img = document.createElement("img");
      frame.appendChild(img);

      // Mirrors the node's attributes onto the DOM. Called on creation and on
      // every `update`, so an undo of a resize snaps the frame back.
      let current = node;
      function render() {
        img.src = current.attrs.src ?? "";
        img.alt = current.attrs.alt ?? "";
        if (current.attrs.title) img.title = current.attrs.title;
        else img.removeAttribute("title");
        frame.style.width = (current.attrs.width as string | null) ?? "100%";
      }
      render();

      // Live width during a drag, committed to the document on pointer-up.
      let dragging: { startX: number; startWidth: number; columnWidth: number; grow: number } | null = null;
      let percent = 0;

      function onPointerMove(event: PointerEvent) {
        if (!dragging) return;
        const delta = (event.clientX - dragging.startX) * dragging.grow;
        const width = dragging.startWidth + delta;
        percent = Math.round((width / dragging.columnWidth) * 100);
        percent = Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, percent));
        frame.style.width = `${percent}%`;
      }

      function onPointerUp() {
        if (!dragging) return;
        dragging = null;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        wrapper.classList.remove("is-resizing");
        const pos = typeof getPos === "function" ? getPos() : null;
        if (pos === null || pos === undefined) return;
        // Write the final width through a transaction so it lands in the
        // document, the undo history, and the saved HTML.
        editor.view.dispatch(
          editor.view.state.tr.setNodeMarkup(pos, undefined, {
            ...current.attrs,
            width: `${percent}%`,
          }),
        );
      }

      for (const corner of CORNERS) {
        const handle = document.createElement("span");
        handle.className = `img-resize-handle img-resize-handle-${corner}`;
        handle.setAttribute("data-corner", corner);
        // The image node is draggable; without this a handle drag can turn into
        // a native HTML5 drag of the image instead of a resize.
        handle.draggable = false;
        handle.addEventListener("dragstart", (event) => event.preventDefault());
        handle.addEventListener("pointerdown", (event) => {
          if (!editor.isEditable || event.button !== 0) return;
          // Keep ProseMirror from starting a text selection or node drag.
          event.preventDefault();
          event.stopPropagation();
          const columnWidth = wrapper.clientWidth;
          if (!columnWidth) return;
          dragging = {
            startX: event.clientX,
            startWidth: frame.offsetWidth,
            columnWidth,
            // West handles grow the image when dragged left, east handles when
            // dragged right.
            grow: corner === "nw" || corner === "sw" ? -1 : 1,
          };
          percent = Math.round((dragging.startWidth / columnWidth) * 100);
          wrapper.classList.add("is-resizing");
          window.addEventListener("pointermove", onPointerMove);
          window.addEventListener("pointerup", onPointerUp);
        });
        frame.appendChild(handle);
      }

      return {
        dom: wrapper,
        update(updated) {
          if (updated.type !== current.type) return false;
          current = updated;
          // A live drag owns the frame width; don't fight it mid-gesture.
          if (!dragging) render();
          return true;
        },
        selectNode() {
          wrapper.classList.add("is-selected");
        },
        deselectNode() {
          wrapper.classList.remove("is-selected");
        },
        destroy() {
          window.removeEventListener("pointermove", onPointerMove);
          window.removeEventListener("pointerup", onPointerUp);
        },
      };
    };
  },
});
