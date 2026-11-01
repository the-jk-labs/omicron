// SPDX-License-Identifier: AGPL-3.0-or-later

export function imageDescriptions(root: HTMLElement) {
  const descriptions = new Map<HTMLImageElement, HTMLSpanElement>();
  let hidden = false;

  function refresh() {
    for (const [image, description] of descriptions) {
      if (!root.contains(image) || !image.alt.trim() || image.closest("[contenteditable], .tiptap")) {
        description.remove();
        descriptions.delete(image);
      }
    }
    for (const image of root.querySelectorAll<HTMLImageElement>("img[alt]")) {
      // Mutating an editor's content DOM could turn the description into saved text.
      if (!image.alt.trim() || image.closest("[contenteditable], .tiptap")) continue;
      let description = descriptions.get(image);
      if (!description) {
        description = document.createElement("span");
        description.className = "hidden-image-description";
        description.setAttribute("aria-hidden", "true");
        image.after(description);
        descriptions.set(image, description);
      }
      if (image.nextSibling !== description) image.after(description);
      const text = `Image hidden: ${image.alt}`;
      if (description.textContent !== text) description.textContent = text;
      for (const attribute of ["lang", "dir"]) {
        const value = image.closest(`[${attribute}]`)?.getAttribute(attribute) ?? null;
        if (description.getAttribute(attribute) === value) continue;
        if (value === null) description.removeAttribute(attribute);
        else description.setAttribute(attribute, value);
      }
    }
  }

  const observer = new MutationObserver(() => hidden && refresh());
  function clear() {
    observer.disconnect();
    for (const description of descriptions.values()) description.remove();
    descriptions.clear();
  }

  return {
    update(next: boolean) {
      hidden = next;
      if (!hidden) return clear();
      refresh();
      observer.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["alt", "lang", "dir"],
      });
    },
    destroy: clear,
  };
}
