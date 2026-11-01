// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Node } from "@tiptap/pm/model";

export type AccessibilityIssue = {
  code: string;
  pos: number;
  kind: "image" | "heading" | "table" | "link";
  label: string;
  message: string;
};

// These are authoring prompts, not a WCAG conformance verdict.
export function checkAccessibility(doc: Node): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  let previousHeading = 1;
  let images = 0;
  let tables = 0;
  doc.descendants((node, pos) => {
    const add = (code: string, kind: AccessibilityIssue["kind"], label: string, message: string) =>
      issues.push({ code, pos, kind, label, message });
    if (node.type.name === "image") {
      images++;
      if (node.attrs.alt !== "" && (typeof node.attrs.alt !== "string" || !node.attrs.alt.trim())) {
        add(
          "image-alt",
          "image",
          `image ${images}`,
          "Describe this image, or explicitly mark it decorative if it adds no information.",
        );
      }
    }
    if (node.type.name === "heading") {
      const level = Number(node.attrs.level);
      if (level === 1 || level > previousHeading + 1) {
        add(
          "heading-order",
          "heading",
          `heading: ${node.textContent || "empty"}`,
          "The article title is Heading 1. Use Heading 2 for sections and nest subsequent headings in order.",
        );
      }
      if (!node.textContent.trim())
        add(
          "heading-empty",
          "heading",
          "empty heading",
          "Give this heading a descriptive name, or change it to normal text.",
        );
      previousHeading = level;
    }
    if (node.type.name === "table") {
      tables++;
      let hasHeaders = false;
      let emptyHeader = false;
      node.descendants((cell) => {
        if (cell.type.name === "tableHeader") {
          hasHeaders = true;
          emptyHeader ||= !cell.textContent.trim();
        }
      });
      if (!hasHeaders)
        add(
          "table-headers",
          "table",
          `table ${tables}`,
          "Identify a header row or column so readers can understand the data relationships.",
        );
      if (emptyHeader)
        add(
          "table-empty-header",
          "table",
          `table ${tables} headers`,
          "Review empty header cells. Add descriptive labels where they identify data.",
        );
      if (!node.attrs.caption?.trim() && !node.attrs["aria-label"]?.trim()) {
        add(
          "table-caption",
          "table",
          `table ${tables} description`,
          "Consider a caption that explains this table's purpose. Complex tables also need a manual relationships review.",
        );
      }
    }
    if (
      node.isText &&
      node.marks.some((mark) => mark.type.name === "link") &&
      /^(click here|here|read more|more)$/i.test(node.textContent.trim())
    ) {
      add(
        "link-purpose",
        "link",
        `link: ${node.textContent}`,
        "Use link text that describes the destination or purpose in context.",
      );
    }
  });
  return issues;
}
