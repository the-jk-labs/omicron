// SPDX-License-Identifier: AGPL-3.0-or-later
const ATTRIBUTES = [
  "lang",
  "dir",
  "alt",
  "title",
  "role",
  "id",
  "headers",
  "scope",
  "colspan",
  "rowspan",
  "start",
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "href",
  "src",
];
const ALIASES: Record<string, string> = { b: "strong", i: "em", del: "s", strike: "s" };
const canonicalTag = (tag: string) => ALIASES[tag] ?? tag;

function inventory(html: string) {
  const body = new DOMParser().parseFromString(html, "text/html").body;
  const items = new Map<string, number>();
  const add = (item: string) => items.set(item, (items.get(item) ?? 0) + 1);
  for (const element of body.querySelectorAll("*")) {
    const tag = canonicalTag(element.localName);
    add(`element: ${tag}`);
    for (const attribute of ATTRIBUTES) {
      if (element.hasAttribute(attribute)) add(`${tag} ${attribute}: ${element.getAttribute(attribute)}`);
    }
  }
  return { items, text: body.textContent?.replace(/\s+/g, "") ?? "" };
}

export function contentLoss(originalHtml: string, editorHtml: string): string[] {
  const original = inventory(originalHtml);
  const edited = inventory(editorHtml);
  const losses = [...original.items]
    .filter(([item, count]) => (edited.items.get(item) ?? 0) < count)
    .map(([item]) => item);
  if (original.text !== edited.text) losses.push("text content");
  return losses;
}
