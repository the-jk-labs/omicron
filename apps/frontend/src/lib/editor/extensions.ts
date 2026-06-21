import StarterKit from "@tiptap/starter-kit";
import type { Extensions } from "@tiptap/core";

// Editor extensions live here so the feature set is configured in one place.
// StarterKit ships headings, bold, italic, lists, blockquote, etc. Add images
// / embeds here later without touching the component.
export const extensions: Extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2] },
  }),
];
