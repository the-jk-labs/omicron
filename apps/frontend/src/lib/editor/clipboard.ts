// SPDX-License-Identifier: AGPL-3.0-or-later
import { DOMSerializer, Fragment, Slice, type Node, type Schema } from "@tiptap/pm/model";
import { CONTENT_ATTRIBUTES } from "./content-accessibility";
import { contentLoss } from "./contentLoss";

export function preserveClipboardBoundaries(slice: Slice): Slice {
  if (!slice.openStart && !slice.openEnd) return slice;
  let hasMetadata = false;
  slice.content.descendants((node) => {
    if (node.isBlock && CONTENT_ATTRIBUTES.some((name) => node.attrs[name] !== null && node.attrs[name] !== undefined))
      hasMetadata = true;
  });
  const structuredBoundary = [slice.content.firstChild, slice.content.lastChild].some(
    (node) => node?.isBlock && node.type.name !== "paragraph",
  );
  // Joining an open slice to the target paragraph drops the source block's attributes.
  return hasMetadata || structuredBoundary ? new Slice(slice.content, 0, 0) : slice;
}

export function clipboardLoss(html: string, slice: Slice, schema: Schema): string[] {
  const container = document.createElement("div");
  container.append(DOMSerializer.fromSchema(schema).serializeFragment(slice.content));
  return contentLoss(html, container.innerHTML);
}

export function clipboardImageCount(slice: Slice): number {
  let count = 0;
  slice.content.descendants((node) => {
    if (node.type.name === "image") count++;
  });
  return count;
}

export function rehostClipboardImages(slice: Slice, sources: string[]): Slice {
  if (clipboardImageCount(slice) !== sources.length)
    throw new Error("Clipboard image count does not match uploaded files.");
  let index = 0;
  function rewrite(fragment: Fragment): Fragment {
    const nodes: Node[] = [];
    fragment.forEach((node) => {
      nodes.push(
        node.type.name === "image"
          ? node.type.create({ ...node.attrs, src: sources[index++] }, node.content, node.marks)
          : node.copy(rewrite(node.content)),
      );
    });
    return Fragment.fromArray(nodes);
  }
  return new Slice(rewrite(slice.content), slice.openStart, slice.openEnd);
}
