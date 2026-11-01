// SPDX-License-Identifier: AGPL-3.0-or-later
import { DOMSerializer, Fragment, Slice, type Attrs, type Node, type Schema } from "@tiptap/pm/model";

const REFERENCES = ["aria-labelledby", "aria-describedby", "headers"];
const ID_TOKEN = /[^\t\n\f\r ]+/g;

function rendered(content: Fragment, schema: Schema) {
  const container = document.createElement("div");
  container.append(DOMSerializer.fromSchema(schema).serializeFragment(content));
  return container;
}

function identifiers(container: HTMLElement) {
  const ids = new Map<string, number>();
  for (const element of container.querySelectorAll("[id]")) {
    const id = element.getAttribute("id")!;
    if (id) ids.set(id, (ids.get(id) ?? 0) + 1);
  }
  return ids;
}

function fragmentId(href: unknown): string | null {
  if (typeof href !== "string" || !href.startsWith("#") || href === "#") return null;
  try {
    return decodeURIComponent(href.slice(1));
  } catch {
    return href.slice(1);
  }
}

export function remapTransferIds(slice: Slice, destination: Node): Slice {
  const existing = identifiers(rendered(destination.content, destination.type.schema));
  const incoming = identifiers(rendered(slice.content, destination.type.schema));
  const reserved = new Set([...existing.keys(), ...incoming.keys()]);
  const renamed = new Map<string, string>();
  for (const [id, count] of incoming) {
    // Repeated source IDs already have ambiguous targets; do not invent an association.
    if (count !== 1 || !existing.has(id)) continue;
    let replacement = `${id}-copy`;
    for (let suffix = 2; reserved.has(replacement); suffix++) replacement = `${id}-copy-${suffix}`;
    renamed.set(id, replacement);
    reserved.add(replacement);
  }
  if (!renamed.size) return slice;

  function attributes(original: Attrs): Attrs {
    const attrs = { ...original };
    if (typeof attrs.id === "string") attrs.id = renamed.get(attrs.id) ?? attrs.id;
    for (const name of REFERENCES) {
      if (typeof attrs[name] === "string")
        attrs[name] = attrs[name].replace(ID_TOKEN, (id: string) => renamed.get(id) ?? id);
    }
    const id = fragmentId(attrs.href);
    if (id !== null && renamed.has(id)) attrs.href = `#${encodeURIComponent(renamed.get(id)!)}`;
    if (attrs.captionAttributes) attrs.captionAttributes = attributes(attrs.captionAttributes);
    return attrs;
  }
  function rewrite(content: Fragment): Fragment {
    const nodes: Node[] = [];
    content.forEach((node) => {
      const marks = node.marks.map((mark) => mark.type.create(attributes(mark.attrs)));
      nodes.push(
        node.isText ? node.mark(marks) : node.type.create(attributes(node.attrs), rewrite(node.content), marks),
      );
    });
    return Fragment.fromArray(nodes);
  }
  return new Slice(rewrite(slice.content), slice.openStart, slice.openEnd);
}

function problems(doc: Node, content = doc.content) {
  const documentContent = rendered(doc.content, doc.type.schema);
  const container = content === doc.content ? documentContent : rendered(content, doc.type.schema);
  const ids = identifiers(documentContent);
  const found = new Map<string, number>();
  const add = (problem: string) => found.set(problem, (found.get(problem) ?? 0) + 1);
  for (const id of identifiers(container).keys()) {
    const count = ids.get(id) ?? 0;
    if (count > 1) found.set(`duplicate ID: ${id}`, count - 1);
  }
  for (const element of container.querySelectorAll("*")) {
    const references = REFERENCES.map((name) => [name, element.getAttribute(name)?.match(ID_TOKEN) ?? []] as const);
    const fragment = fragmentId(element.getAttribute("href"));
    if (fragment !== null) references.push(["href", [fragment]]);
    for (const [name, targets] of references) {
      for (const id of targets) {
        const count = ids.get(id) ?? 0;
        if (count !== 1) add(`${count ? "ambiguous" : "missing"} ${name} target: ${id}`);
      }
    }
  }
  return found;
}

export function transferReferenceProblems(before: Node, after: Node, incoming?: Slice): string[] {
  const previous = problems(before);
  const introduced = [...problems(after)]
    .filter(([problem, count]) => count > (previous.get(problem) ?? 0))
    .map(([problem]) => problem);
  // Existing defects must not mask the same defect in newly transferred content.
  return [...new Set([...introduced, ...(incoming ? problems(after, incoming.content).keys() : [])])];
}
