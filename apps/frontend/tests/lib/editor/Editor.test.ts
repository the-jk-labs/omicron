import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Content, Editor as TiptapEditor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import { tick } from "svelte";
import { beforeEach, expect, test, vi } from "vitest";
import Editor from "#lib/editor/Editor.svelte";
import { EDIT_ALT_EVENT } from "#lib/editor/resizable-image.js";
import { expectAccessible } from "../../accessibility";
import { apiError, fakeFetch } from "../../fakeFetch";
import { complexTableHtml, targetTableHtml } from "./transfer-fixtures";

vi.mock(import("#lib/editor/image.js"), async (importOriginal) => ({
  ...(await importOriginal()),
  prepareImage: async (file: Blob) => ({ blob: file, type: "image/webp" }),
}));
vi.mock("emoji-picker-element", () => ({}));

// Holding back onMount shows what the server renders, before Tiptap starts.
const mounting = vi.hoisted(() => ({ skip: false }));
vi.mock(import("svelte"), async (original) => {
  const svelte = await original();
  return { ...svelte, onMount: (fn) => (mounting.skip ? undefined : svelte.onMount(fn)) };
});

beforeEach(() => {
  // ProseMirror measures ranges when focusing/scrolling; jsdom has no layout.
  Object.assign(Range.prototype, {
    getClientRects: () => [],
    getBoundingClientRect: () => new DOMRect(),
  });
  document.elementFromPoint = () => null;
});

let api: ReturnType<typeof fakeFetch>;
async function setup(content?: Content, routes: Parameters<typeof fakeFetch>[0] = {}, previewHtml?: string) {
  let n = 0;
  api = fakeFetch({ "POST /api/uploads": () => Response.json({ url: `/api/uploads/img${++n}.webp` }), ...routes });
  vi.stubGlobal("fetch", api.fetch);
  const onUpdate = vi.fn<(html: string, json: unknown) => void>();
  render(Editor, { props: { onUpdate, content, previewHtml } });
  const dom = await waitFor(() => {
    const el = document.querySelector<HTMLElement & { editor?: TiptapEditor }>(".tiptap");
    if (!el?.editor) throw new Error("editor not mounted");
    return el;
  });
  return { editor: dom.editor!, dom, onUpdate };
}

const tool = (label: string) => fireEvent.click(screen.getByRole("button", { name: label }));
function pasteHtml(editor: TiptapEditor, html: string, files: File[] = []) {
  const event = new Event("paste", { cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: { files, getData: (type: string) => (type === "text/html" ? html : "") },
  });
  editor.view.pasteHTML(html, event);
}

// Unlike view.pasteHTML, DOM dispatch exercises the pre-parse paste hook.
function nativePaste(dom: HTMLElement, html: string, plain = "Bonjour") {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      files: [],
      getData: (type: string) => (type === "text/html" ? html : type === "text/plain" ? plain : ""),
    },
  });
  dom.dispatchEvent(event);
}
function dropHtml(editor: TiptapEditor, html: string, files: File[] = [], pos = 8, text = "", copy = false) {
  vi.spyOn(editor.view, "posAtCoords").mockReturnValue({ pos, inside: -1 });
  const event = new MouseEvent("drop", {
    bubbles: true,
    cancelable: true,
    clientX: 10,
    clientY: 10,
    ctrlKey: copy,
    altKey: copy,
  }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", {
    value: { files, getData: (type: string) => (type === "text/html" ? html : type === "text/plain" ? text : "") },
  });
  editor.view.dom.dispatchEvent(event);
  return event;
}
function textPosition(editor: TiptapEditor, text: string) {
  let found: number | undefined;
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === text) found = pos;
  });
  if (found === undefined) throw new Error(`Text not found: ${text}`);
  return found;
}
function selectTargetCells(editor: TiptapEditor) {
  const cells: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "tableCell") cells.push(pos);
  });
  expect(cells).toHaveLength(2);
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cells[0], cells[1])));
  return editor.state.selection.toJSON();
}
function transfer(editor: TiptapEditor, kind: "paste" | "drop", html: string, files: File[] = [], pos?: number) {
  if (kind === "paste") pasteHtml(editor, html, files);
  else dropHtml(editor, html, files, pos);
}
function serialized(editor: TiptapEditor) {
  const body = document.createElement("div");
  body.innerHTML = editor.getHTML();
  return body;
}
const status = () => document.body.textContent.match(/[\d,]+ characters?.*?(min read|words?)/)?.[0];

function renderUnmounted(previewHtml?: string) {
  mounting.skip = true;
  try {
    render(Editor, { props: { onUpdate: () => {}, previewHtml } });
  } finally {
    mounting.skip = false;
  }
  return document.querySelector<HTMLElement>(".tiptap")!;
}

test("before Tiptap starts, a new post shows the toolbar and the placeholder line", () => {
  const body = renderUnmounted();
  expect(screen.getByRole("toolbar")).toBeInTheDocument();
  expect(body.querySelector("p.is-editor-empty")).toHaveAttribute("data-placeholder", "Write your article…");
  expect(screen.queryByText(/Loading/)).toBeNull();
});

test("before Tiptap starts, a draft shows its stored body", () => {
  const body = renderUnmounted("<h2>Hello</h2><p>Some <strong>text</strong>.</p>");
  expect(body.querySelector("h2")).toHaveTextContent("Hello");
  expect(body.querySelector("strong")).toHaveTextContent("text");
  expect(body).toHaveAttribute("aria-hidden", "true");
});

test("once Tiptap starts, it replaces the static body: one editable surface remains", async () => {
  const { dom } = await setup("<p>Body</p>");
  expect(document.querySelectorAll(".tiptap")).toHaveLength(1);
  expect(dom).toHaveAttribute("contenteditable", "true");
});

test("the editable body has a persistent accessible name and multiline textbox semantics", async () => {
  const { dom } = await setup();
  expect(screen.getByRole("textbox", { name: "Article body" })).toBe(dom);
  expect(dom).toHaveAttribute("aria-multiline", "true");
  await expectAccessible(document.body);
});

test.each(["Escape", "F10"])("toolbar %s returns to a backward selection without changing content", async (key) => {
  const { editor, dom, onUpdate } = await setup("<p>Draft body</p>");
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 6, 1)));
  editor.view.focus();
  const selection = editor.state.selection.toJSON();
  const doc = editor.state.doc;
  await fireEvent.keyDown(dom, { key: "F10", altKey: true });
  const style = screen.getByRole("button", { name: "Text style" });
  expect(style).toHaveFocus();
  await fireEvent.keyDown(style, { key, altKey: key === "F10" });
  expect(dom).toHaveFocus();
  expect(editor.state.selection.toJSON()).toEqual(selection);
  expect(editor.state.doc).toBe(doc);
  expect(onUpdate).not.toHaveBeenCalled();
});

test.each(["image", "cells"])("toolbar round trip preserves a %s selection", async (kind) => {
  const { editor, dom, onUpdate } = await setup(
    kind === "image" ? '<p>Before</p><img src="/a.png" alt="A graph"><p>After</p>' : targetTableHtml,
  );
  if (kind === "cells") selectTargetCells(editor);
  else {
    let pos = 0;
    editor.state.doc.descendants((node, position) => {
      if (node.type.name === "image") pos = position;
    });
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
  }
  editor.view.focus();
  const selection = editor.state.selection.toJSON();
  await fireEvent.keyDown(dom, { key: "F10", altKey: true });
  const style = screen.getByRole("button", { name: "Text style" });
  expect(style).toHaveFocus();
  await fireEvent.keyDown(style, { key: "Escape" });
  expect(dom).toHaveFocus();
  expect(editor.state.selection.toJSON()).toEqual(selection);
  expect(onUpdate).not.toHaveBeenCalled();
});

test.each([
  { key: "F10" },
  { key: "F10", altKey: true, shiftKey: true },
  { key: "F10", altKey: true, ctrlKey: true },
  { key: "F10", altKey: true, metaKey: true },
  { key: "F10", altKey: true, isComposing: true },
  { key: "k", ctrlKey: true, isComposing: true },
  { key: "k", ctrlKey: true, altKey: true },
  { key: "k", ctrlKey: true, shiftKey: true },
])("editor shortcuts ignore unrelated modifiers and composition: %j", async (keys) => {
  const { editor, dom, onUpdate } = await setup("<p>Draft body</p>");
  editor.view.focus();
  await fireEvent.keyDown(dom, keys);
  expect(dom).toHaveFocus();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(onUpdate).not.toHaveBeenCalled();
});

test("toolbar return respects an already handled Escape", async () => {
  const { editor, dom } = await setup("<p>Draft body</p>");
  editor.view.focus();
  await fireEvent.keyDown(dom, { key: "F10", altKey: true });
  const style = screen.getByRole("button", { name: "Text style" });
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  event.preventDefault();
  style.dispatchEvent(event);
  expect(style).toHaveFocus();
});

test("editor navigation respects an already handled shortcut", async () => {
  const { editor, dom } = await setup("<p>Draft body</p>");
  editor.view.focus();
  const event = new KeyboardEvent("keydown", { key: "F10", altKey: true, bubbles: true, cancelable: true });
  event.preventDefault();
  dom.dispatchEvent(event);
  expect(dom).toHaveFocus();
});

test.each([
  { key: "Escape", isComposing: true },
  { key: "Escape", shiftKey: true },
  { key: "F10", altKey: true, ctrlKey: true },
])("toolbar return ignores composition and unrelated modifiers: %j", async (keys) => {
  const { editor, dom } = await setup("<p>Draft body</p>");
  editor.view.focus();
  await fireEvent.keyDown(dom, { key: "F10", altKey: true });
  const style = screen.getByRole("button", { name: "Text style" });
  await fireEvent.keyDown(style, keys);
  expect(style).toHaveFocus();
});

test("blocked imports cannot use shortcuts to activate disabled authoring controls", async () => {
  const { editor, dom, onUpdate } = await setup("<figure><p>Original</p><figcaption>Caption</figcaption></figure>");
  editor.view.focus();
  await fireEvent.keyDown(dom, { key: "F10", altKey: true });
  await fireEvent.keyDown(dom, { key: "k", ctrlKey: true });
  expect(screen.getByRole("button", { name: "Text style" })).not.toHaveFocus();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(dom).toHaveAttribute("contenteditable", "false");
  expect(onUpdate).not.toHaveBeenCalled();
});

test.each(["ctrlKey", "metaKey"])("%s+K opens the existing link dialog", async (modifier) => {
  const { editor, dom } = await setup("<p>Draft body</p>");
  editor.commands.setTextSelection({ from: 1, to: 6 });
  editor.view.focus();
  await fireEvent.keyDown(dom, { key: "k", [modifier]: true });
  expect(await screen.findByRole("dialog", { name: "Add link" })).toBeInTheDocument();
  expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe("Draft");
});

test("upload failures are announced to assistive technology", async () => {
  await setup("<p></p>", { "POST /api/uploads": apiError(413, "Image too large") });
  await fireEvent.change(imageInput(), { target: { files: [png("a.png")] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Image too large");
});

test("stored HTML is parsed as HTML, not escaped as Markdown text", async () => {
  const { editor } = await setup("<p>alpha <strong>beta</strong></p>");
  expect(editor.getHTML()).toBe("<p>alpha <strong>beta</strong></p>");
});

test.each(["forward", "backward", "caret"])(
  "native paste uses the %s DOM range before its selectionchange notification arrives",
  async (direction) => {
    const { editor, dom } = await setup("<p>Draft body</p>");
    editor.commands.setTextSelection({ from: 7, to: 8 });
    editor.view.focus();
    const text = dom.querySelector("p")!.firstChild!;
    const anchor = direction === "backward" ? 9 : 6;
    const head = direction === "forward" ? 9 : 6;
    window.getSelection()!.setBaseAndExtent(text, anchor, text, head);
    expect(editor.state.selection.to).toBe(8);
    expect(window.getSelection()!.toString()).toBe(direction === "caret" ? "" : "bod");
    nativePaste(dom, '<p lang="fr" dir="ltr">Bonjour</p>');
    expect(dom.querySelector("p[lang=fr]")?.textContent).toBe("Bonjour");
    expect(dom.querySelector("p:first-child")?.textContent).toBe("Draft ");
    expect(dom.querySelector("p:last-child")?.textContent).toBe(direction === "caret" ? "body" : "y");
    expect(editor.commands.undo()).toBe(true);
    expect(dom.textContent).toBe("Draft body");
  },
);

test("native paste parses plain text in the pending DOM code-block context", async () => {
  const { editor, dom } = await setup("<p>Before</p><pre><code>alpha</code></pre>");
  editor.commands.setTextSelection(1);
  editor.view.focus();
  const text = dom.querySelector("code")!.firstChild!;
  window.getSelection()!.setBaseAndExtent(text, 2, text, 2);
  nativePaste(dom, "<strong>Bonjour</strong>");
  expect(dom.querySelector("p")?.textContent).toBe("Before");
  expect(dom.querySelector("code")?.textContent).toBe("alBonjourpha");
  expect(dom.querySelector("strong")).toBeNull();
  expect(editor.commands.undo()).toBe(true);
  expect(dom.querySelector("code")?.textContent).toBe("alpha");
});

test("native paste uses a pending table caret without changing the grid or header relationships", async () => {
  const { editor, dom } = await setup(targetTableHtml);
  const start = textPosition(editor, "alpha");
  editor.commands.setTextSelection(start);
  editor.view.focus();
  const cell = dom.querySelector('td[headers="target-left"]')!;
  const text = cell.querySelector("p")!.firstChild!;
  window.getSelection()!.setBaseAndExtent(text, 2, text, 2);
  nativePaste(dom, '<p lang="fr" dir="ltr">Bonjour</p>');
  expect(cell.textContent).toBe("alBonjourpha");
  expect(cell.querySelector("p[lang=fr]")?.getAttribute("dir")).toBe("ltr");
  expect(dom.querySelector('td[headers="target-right"]')?.textContent).toBe("beta");
  expect(dom.querySelector("caption")?.textContent).toBe("Destination table");
  expect(dom.querySelectorAll("table")).toHaveLength(1);
  expect(editor.commands.undo()).toBe(true);
  expect(dom.querySelector('td[headers="target-left"]')?.textContent).toBe("alpha");
});

test("cancelling native paste loss review restores the pending backward DOM selection", async () => {
  const { editor, dom } = await setup("<p>Draft body</p>");
  editor.commands.setTextSelection({ from: 7, to: 8 });
  editor.view.focus();
  const text = dom.querySelector("p")!.firstChild!;
  window.getSelection()!.setBaseAndExtent(text, 9, text, 6);
  nativePaste(dom, "<figure><figcaption>Caption</figcaption></figure>", "Caption");
  await screen.findByRole("dialog", { name: "Review pasted content" });
  await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(editor.state.selection.anchor).toBe(10);
  expect(editor.state.selection.head).toBe(7);
  expect(dom.textContent).toBe("Draft body");
  expect(api.calls).toHaveLength(0);
});

test.each(["image", "cells"])("native paste selection synchronization preserves a %s selection", async (kind) => {
  const { editor, dom } = await setup(
    kind === "image" ? '<p>Before</p><img src="/a.png" alt="Graph"><p>After</p>' : targetTableHtml,
  );
  if (kind === "image") editor.commands.setNodeSelection(8);
  else selectTargetCells(editor);
  editor.view.focus();
  const selection = editor.state.selection.toJSON();
  nativePaste(dom, "<figure><figcaption>Caption</figcaption></figure>", "Caption");
  expect(editor.state.selection.toJSON()).toEqual(selection);
  await screen.findByRole("dialog", { name: "Review pasted content" });
  await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(editor.state.selection.toJSON()).toEqual(selection);
  expect(editor.state.selection).toBeInstanceOf(kind === "image" ? NodeSelection : CellSelection);
});

test.each(["readonly", "composing", "unfocused", "prevented", "review"])(
  "native paste does not synchronize a pending range when %s",
  async (guard) => {
    const { editor, dom } = await setup("<p>Draft body</p>");
    editor.commands.setTextSelection({ from: 7, to: 8 });
    editor.view.focus();
    if (guard === "readonly") editor.setEditable(false);
    if (guard === "composing") vi.spyOn(editor.view, "composing", "get").mockReturnValue(true);
    if (guard === "unfocused") screen.getByRole("button", { name: "Bold" }).focus();
    if (guard === "prevented")
      dom.addEventListener("paste", (event) => event.preventDefault(), { capture: true, once: true });
    if (guard === "review") {
      pasteHtml(editor, "<figure><figcaption>Caption</figcaption></figure>");
      await screen.findByRole("dialog", { name: "Review pasted content" });
      editor.view.focus();
    }
    const text = dom.querySelector("p")!.firstChild!;
    window.getSelection()!.setBaseAndExtent(text, 6, text, 9);
    const dispatch = vi.spyOn(document, "dispatchEvent");
    const before = editor.state.selection.toJSON();
    // Exercise the pre-parse hook directly, without letting fallback paste change the selection.
    if (guard === "prevented") nativePaste(dom, "<p>Bonjour</p>");
    else editor.view.someProp("handleDOMEvents")!.paste!(editor.view, new Event("paste") as ClipboardEvent);
    expect(dispatch).not.toHaveBeenCalled();
    expect(editor.state.selection.toJSON()).toEqual(before);
    expect(dom.textContent).toBe("Draft body");
  },
);

test("unsupported clipboard HTML cannot silently replace the selection", async () => {
  const { editor, onUpdate } = await setup("<p>Original</p>");
  editor.commands.selectAll();
  pasteHtml(editor, '<figure><img src="/a.png" alt="A graph"><figcaption lang="fr">Sales graph</figcaption></figure>');
  expect(editor.getHTML()).toBe("<p>Original</p>");
  expect(await screen.findByRole("dialog", { name: "Review pasted content" })).toHaveTextContent("simplify");
  expect(onUpdate).not.toHaveBeenCalled();
});

test("pasted image files preserve HTML descriptions, passage language and surrounding text", async () => {
  const { editor } = await setup("<p></p>");
  pasteHtml(editor, '<p>Before</p><img src="file:///image.png" alt="A graph" lang="fr" dir="ltr"><p>After</p>', [
    png("image.png"),
  ]);
  await waitFor(() => expect(editor.getHTML()).toContain('src="/api/uploads/img1.webp"'));
  expect(editor.getHTML()).toContain('alt="A graph"');
  expect(editor.getHTML()).toContain('lang="fr"');
  expect(editor.getHTML()).toContain("Before");
  expect(editor.getHTML()).toContain("After");
});

test("cancelling a lossy paste leaves the selection, original body and uploads untouched", async () => {
  const { editor, onUpdate } = await setup("<p>Original</p>");
  editor.commands.selectAll();
  pasteHtml(editor, '<figure><img src="file:///image.png" alt="A graph"><figcaption>Caption</figcaption></figure>', [
    png("image.png"),
  ]);
  await screen.findByRole("dialog", { name: "Review pasted content" });
  await expectAccessible();
  await tool("Cancel");
  expect(editor.getHTML()).toBe("<p>Original</p>");
  expect(onUpdate).not.toHaveBeenCalled();
  expect(api.calls).toHaveLength(0);
});

test("an explicitly accepted simplified paste is one reversible content change", async () => {
  const { editor, onUpdate } = await setup("<p>Original</p>");
  editor.commands.selectAll();
  pasteHtml(editor, '<figure><img src="/a.png" alt="A graph"><figcaption>Caption</figcaption></figure>');
  await fireEvent.click(await screen.findByRole("button", { name: "Paste simplified content" }));
  expect(editor.getHTML()).toContain('alt="A graph"');
  expect(editor.getHTML()).toContain("Caption");
  expect(editor.getHTML()).not.toContain("figure");
  expect(onUpdate).toHaveBeenCalledTimes(1);
  editor.commands.undo();
  expect(editor.getHTML()).toBe("<p>Original</p>");
});

test("supported HTML clipboard metadata is retained without a review dialog", async () => {
  const { editor } = await setup("<p></p>");
  pasteHtml(
    editor,
    '<p lang="fr" dir="ltr">Bonjour</p><table aria-labelledby="caption"><caption id="caption" lang="de">Sales</caption><tr><th id="year" scope="col">Year</th><td headers="year">2026</td></tr></table>',
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(editor.getHTML()).toContain('<p lang="fr" dir="ltr">Bonjour</p>');
  const body = new DOMParser().parseFromString(editor.getHTML(), "text/html");
  expect(body.querySelector("caption")?.getAttribute("lang")).toBe("de");
  expect(body.querySelector("caption")?.getAttribute("id")).toBe("caption");
  expect(editor.getHTML()).toContain('headers="year"');
  expect(editor.getHTML()).toContain('scope="col"');
});

test("plain-text Markdown keeps its existing clipboard parsing behavior", async () => {
  const { editor } = await setup("<p></p>");
  editor.view.pasteText("**Bold** text", new Event("paste") as ClipboardEvent);
  expect(editor.getHTML()).toContain("<strong>Bold</strong>");
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("pasted HTML headings keep their structural level instead of joining the target paragraph", async () => {
  const { editor } = await setup("<p>Opening</p>");
  editor.commands.setTextSelection(4);
  pasteHtml(editor, "<h2>New section</h2>");
  expect(editor.getHTML()).toContain("<h2>New section</h2>");
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("a clipboard screenshot without HTML remains unreviewed rather than receiving invented alt text", async () => {
  const { editor } = await setup("<p></p>");
  pasteHtml(editor, "", [png("screenshot.png")]);
  await waitFor(() => expect(editor.getHTML()).toContain('src="/api/uploads/img1.webp"'));
  expect(editor.getJSON().content[0].attrs!.alt).toBeNull();
  await screen.findByRole("button", { name: "Check accessibility (1)" });
});

test("decorative alternatives are preserved when clipboard images are rehosted", async () => {
  const { editor } = await setup("<p></p>");
  pasteHtml(editor, '<img src="file:///image.png" alt="">', [png("image.png")]);
  await waitFor(() => expect(editor.getHTML()).toContain('src="/api/uploads/img1.webp"'));
  expect(editor.getJSON().content[0].attrs!.alt).toBe("");
});

test("ambiguous clipboard image associations fail without discarding descriptions or uploading", async () => {
  const { editor, onUpdate } = await setup("<p>Original</p>");
  pasteHtml(editor, '<img src="file:///one.png" alt="One"><img src="file:///two.png" alt="Two">', [
    png("one.png"),
    png("two.png"),
  ]);
  expect(await screen.findByRole("alert")).toHaveTextContent("Paste one image at a time");
  expect(editor.getHTML()).toBe("<p>Original</p>");
  expect(onUpdate).not.toHaveBeenCalled();
  expect(api.calls).toHaveLength(0);
});

test("clipboard upload failures leave the original selection unchanged", async () => {
  const { editor, onUpdate } = await setup("<p>Original</p>", {
    "POST /api/uploads": apiError(413, "Image too large"),
  });
  editor.commands.selectAll();
  pasteHtml(editor, '<img src="file:///image.png" alt="A graph">', [png("image.png")]);
  expect(await screen.findByRole("alert")).toHaveTextContent("Image too large");
  expect(editor.getHTML()).toBe("<p>Original</p>");
  expect(onUpdate).not.toHaveBeenCalled();
});

test("an asynchronous clipboard upload keeps its original insertion point through other edits", async () => {
  const upload = Promise.withResolvers<Response>();
  const { editor } = await setup("<p>Before</p><p>After</p>", { "POST /api/uploads": () => upload.promise });
  editor.commands.setTextSelection(9);
  pasteHtml(editor, '<img src="file:///image.png" alt="A graph">', [png("image.png")]);
  await waitFor(() => expect(api.calls).toHaveLength(1));
  editor.commands.insertContentAt(1, "New ");
  editor.commands.setTextSelection(2);
  upload.resolve(Response.json({ url: "/api/uploads/rehosted.webp" }));
  await waitFor(() => expect(editor.getHTML()).toContain("rehosted.webp"));
  const html = editor.getHTML();
  expect(html.indexOf("New Before")).toBeLessThan(html.indexOf("rehosted.webp"));
  expect(html.indexOf("rehosted.webp")).toBeLessThan(html.indexOf("After"));
});

test("pasting supported text cannot hide an image upload that is still running", async () => {
  const upload = Promise.withResolvers<Response>();
  const { editor } = await setup("<p></p>", { "POST /api/uploads": () => upload.promise });
  pasteHtml(editor, '<img src="file:///image.png" alt="A graph">', [png("image.png")]);
  await waitFor(() => expect(api.calls).toHaveLength(1));
  pasteHtml(editor, '<p lang="fr">Translated passage</p>');
  await tick();
  expect(screen.getByRole("status")).toHaveTextContent("Uploading image");
  upload.resolve(Response.json({ url: "/api/uploads/rehosted.webp" }));
  await waitFor(() => expect(editor.getHTML()).toContain("rehosted.webp"));
});

test("unsupported dropped HTML cannot silently simplify or mutate the article", async () => {
  const { editor, onUpdate } = await setup("<p>Before</p><p>After</p>");
  dropHtml(editor, '<figure><img src="/a.png" alt="A graph"><figcaption lang="fr">Sales graph</figcaption></figure>');
  expect(editor.getHTML()).toBe("<p>Before</p><p>After</p>");
  expect(await screen.findByRole("dialog", { name: "Review dropped content" })).toHaveTextContent("simplify");
  expect(onUpdate).not.toHaveBeenCalled();
});

test("dropped image files retain HTML descriptions and text at the drop point instead of the old selection", async () => {
  const { editor } = await setup("<p>Before</p><p>After</p>");
  editor.commands.selectAll();
  dropHtml(
    editor,
    '<p>Image context</p><img src="file:///image.png" alt="A graph" lang="en" dir="ltr"><p>Image details</p>',
    [png("image.png")],
  );
  await waitFor(() => expect(editor.getHTML()).toContain('src="/api/uploads/img1.webp"'));
  const html = editor.getHTML();
  expect(html).toContain('alt="A graph"');
  expect(html).toContain('lang="en"');
  expect(html).toContain("Image context");
  expect(html).toContain("Image details");
  expect(html.indexOf("Before")).toBeLessThan(html.indexOf("img1.webp"));
  expect(html.indexOf("img1.webp")).toBeLessThan(html.indexOf("After"));
});

test("cancelling a lossy drop leaves the article, selection and upload storage untouched", async () => {
  const { editor, onUpdate } = await setup("<p>Before</p><p>After</p>");
  editor.commands.selectAll();
  const selected = editor.state.selection.toJSON();
  dropHtml(editor, '<figure><img src="file:///image.png" alt="A graph"><figcaption>Caption</figcaption></figure>', [
    png("image.png"),
  ]);
  await screen.findByRole("dialog", { name: "Review dropped content" });
  await expectAccessible();
  await tool("Cancel");
  expect(editor.getHTML()).toBe("<p>Before</p><p>After</p>");
  expect(editor.state.selection.toJSON()).toEqual(selected);
  expect(onUpdate).not.toHaveBeenCalled();
  expect(api.calls).toHaveLength(0);
});

test("accepting a simplified drop inserts at the mapped pointer location as one undoable change", async () => {
  const { editor } = await setup("<p>Before</p><p>After</p>");
  editor.commands.selectAll();
  dropHtml(editor, '<figure><img src="/a.png" alt="A graph"><figcaption>Caption</figcaption></figure>');
  editor.commands.insertContentAt(1, "New ");
  await fireEvent.click(await screen.findByRole("button", { name: "Insert simplified content" }));
  const html = editor.getHTML();
  expect(html).not.toContain("<figure");
  expect(html).toContain("Caption");
  expect(html.indexOf("New Before")).toBeLessThan(html.indexOf('alt="A graph"'));
  expect(html.indexOf('alt="A graph"')).toBeLessThan(html.indexOf("After"));
  editor.commands.undo();
  expect(editor.getHTML()).toBe("<p>New Before</p><p>After</p>");
});

test("supported drop metadata and table relationships survive without replacing a selection", async () => {
  const { editor } = await setup("<p>Before</p><p>After</p>");
  editor.commands.selectAll();
  dropHtml(
    editor,
    '<h2>Section</h2><p lang="fr" dir="ltr">Translated passage</p><table aria-labelledby="caption"><caption id="caption">Sales</caption><tr><th id="year" scope="col">Year</th><td headers="year">2026</td></tr></table>',
  );
  expect(editor.getHTML()).toContain("<h2>Section</h2>");
  expect(editor.getHTML()).toContain('<p lang="fr" dir="ltr">Translated passage</p>');
  expect(editor.getHTML()).toContain('headers="year"');
  expect(editor.getHTML()).toContain("Before");
  expect(editor.getHTML()).toContain("After");
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("multiple file-only drops retain their mapped location and remain unreviewed", async () => {
  const first = Promise.withResolvers<Response>();
  let count = 0;
  const { editor } = await setup("<p>Before</p><p>After</p>", {
    "POST /api/uploads": () => (++count === 1 ? first.promise : Response.json({ url: "/api/uploads/two.webp" })),
  });
  editor.commands.selectAll();
  dropHtml(editor, "", [png("one.png"), png("two.png")]);
  await waitFor(() => expect(api.calls).toHaveLength(1));
  editor.commands.insertContentAt(1, "New ");
  editor.commands.setTextSelection(2);
  first.resolve(Response.json({ url: "/api/uploads/one.webp" }));
  await waitFor(() => expect(editor.getHTML()).toContain("two.webp"));
  const html = editor.getHTML();
  expect(html.indexOf("New Before")).toBeLessThan(html.indexOf("one.webp"));
  expect(html.indexOf("one.webp")).toBeLessThan(html.indexOf("two.webp"));
  expect(html.indexOf("two.webp")).toBeLessThan(html.indexOf("After"));
  expect(
    editor
      .getJSON()
      .content.filter((node) => node.type === "image")
      .map((node) => node.attrs!.alt),
  ).toEqual([null, null]);
  await screen.findByRole("button", { name: "Check accessibility (2)" });
});

test("dropped image upload failures leave the original article unchanged", async () => {
  const { editor, onUpdate } = await setup("<p>Before</p><p>After</p>", {
    "POST /api/uploads": apiError(413, "Image too large"),
  });
  dropHtml(editor, '<img src="file:///image.png" alt="A graph">', [png("image.png")]);
  expect(await screen.findByRole("alert")).toHaveTextContent("Image too large");
  expect(editor.getHTML()).toBe("<p>Before</p><p>After</p>");
  expect(onUpdate).not.toHaveBeenCalled();
});

test("ambiguous dropped image associations are rejected before uploads or document changes", async () => {
  const { editor, onUpdate } = await setup("<p>Before</p><p>After</p>");
  dropHtml(editor, '<img src="file:///one.png" alt="One"><img src="file:///two.png" alt="Two">', [
    png("one.png"),
    png("two.png"),
  ]);
  expect(await screen.findByRole("alert")).toHaveTextContent("Drop one image at a time");
  expect(api.calls).toHaveLength(0);
  expect(onUpdate).not.toHaveBeenCalled();
});

test("unsupported files cannot be silently left out of a mixed drop", async () => {
  const { editor, onUpdate } = await setup("<p>Before</p><p>After</p>");
  dropHtml(editor, "", [png("one.png"), new File(["document"], "notes.pdf", { type: "application/pdf" })]);
  expect(await screen.findByRole("alert")).toHaveTextContent("Unsupported image type");
  expect(api.calls).toHaveLength(0);
  expect(onUpdate).not.toHaveBeenCalled();
});

test("unmatched plain text with files is rejected instead of being discarded or invented as alt text", async () => {
  const { editor, onUpdate } = await setup("<p>Before</p><p>After</p>");
  dropHtml(editor, "", [png("one.png")], 8, "A description with no HTML association");
  expect(await screen.findByRole("alert")).toHaveTextContent("Insert the text separately");
  expect(api.calls).toHaveLength(0);
  expect(onUpdate).not.toHaveBeenCalled();
});

test("a dropped decorative image retains its explicitly empty alternative", async () => {
  const { editor } = await setup("<p>Before</p><p>After</p>");
  dropHtml(editor, '<img src="file:///image.png" alt="">', [png("image.png")]);
  await waitFor(() => expect(editor.getHTML()).toContain("img1.webp"));
  expect(editor.getJSON().content.find((node) => node.type === "image")?.attrs!.alt).toBe("");
});

test.for([false, true])("internal model drags preserve descriptions without rehosting (copy: %s)", async (copy) => {
  const { editor } = await setup('<p>Before</p><img src="/a.png" alt="A graph" lang="en"><p>After</p>');
  editor.commands.setNodeSelection(8);
  editor.view.dragging = { slice: editor.state.selection.content(), move: !copy };
  dropHtml(
    editor,
    '<img src="/a.png" alt="A graph" lang="en">',
    [png("image.png")],
    editor.state.doc.content.size,
    "",
    copy,
  );
  const images = editor.getJSON().content.filter((node) => node.type === "image");
  expect(images).toHaveLength(copy ? 2 : 1);
  expect(images.every((node) => node.attrs!.alt === "A graph" && node.attrs!.lang === "en")).toBe(true);
  expect(api.calls).toHaveLength(0);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("loss review uses the drop target rather than a previous code-block selection", async () => {
  const { editor } = await setup("<pre><code>code</code></pre><p>After</p>");
  editor.commands.setTextSelection(2);
  dropHtml(editor, "<figure><figcaption>Caption</figcaption></figure>", [], 7, "Caption");
  await screen.findByRole("dialog", { name: "Review dropped content" });
  expect(editor.getHTML()).not.toContain("Caption");
});

test("dropping text into a code block retains deliberate plain-text insertion", async () => {
  const { editor } = await setup("<p>Before</p><pre><code>code</code></pre><p>After</p>");
  editor.commands.setTextSelection(2);
  dropHtml(editor, "<figure><figcaption>Caption</figcaption></figure>", [], 11, "Caption");
  expect(editor.getHTML()).toContain("coCaptionde");
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("an unresolved drop position never falls back to replacing the current selection", async () => {
  const { editor, onUpdate } = await setup("<p>Before</p><p>After</p>");
  editor.commands.selectAll();
  vi.spyOn(editor.view, "posAtCoords").mockReturnValue(null);
  const event = new MouseEvent("drop", { cancelable: true }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", { value: { files: [png("image.png")], getData: () => "" } });
  editor.view.someProp("handleDrop", (handler) => handler(editor.view, event, editor.state.selection.content(), false));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not find a drop position");
  expect(onUpdate).not.toHaveBeenCalled();
  expect(api.calls).toHaveLength(0);
});

test("unsupported imported structures cannot be silently rewritten by opening the editor", async () => {
  const { editor, dom, onUpdate } = await setup(
    '<figure><img src="/a.png" alt="A graph"><figcaption lang="fr">Sales graph</figcaption></figure>',
  );
  expect(editor.getHTML()).not.toContain("<figure");
  expect(screen.getByRole("alert")).toHaveTextContent("simplify imported content");
  expect(dom).toHaveAttribute("contenteditable", "false");
  expect(dom).toHaveAttribute("aria-readonly", "true");
  expect(screen.getByRole("button", { name: "Bold" })).toBeDisabled();
  expect(onUpdate).not.toHaveBeenCalled();
});

test("acknowledging import loss only updates the saved body after a content edit", async () => {
  const { editor, dom, onUpdate } = await setup("<figure><p>Original</p><figcaption>Caption</figcaption></figure>");
  await tool("Edit simplified content");
  expect(dom).toHaveAttribute("contenteditable", "true");
  expect(dom).toHaveAttribute("aria-readonly", "false");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(onUpdate).not.toHaveBeenCalled();
  editor.commands.insertContent("Edited ");
  expect(onUpdate).toHaveBeenCalledWith(expect.stringContaining("Edited"), expect.any(Object));
});

test("programmatic changes cannot serialize a blocked import", async () => {
  const { editor, onUpdate } = await setup("<figure><p>Original</p><figcaption>Caption</figcaption></figure>");
  editor.commands.insertContent("Changed ");
  expect(onUpdate).not.toHaveBeenCalled();
});

test("a stored JSON body cannot bypass the comparison with original HTML", async () => {
  const { dom, onUpdate } = await setup(
    { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Caption" }] }] },
    {},
    "<figure><figcaption>Caption</figcaption></figure>",
  );
  expect(screen.getByRole("alert")).toHaveTextContent("element: figcaption");
  expect(dom).toHaveAttribute("contenteditable", "false");
  expect(onUpdate).not.toHaveBeenCalled();
});

test("supported markup remains editable without an import warning", async () => {
  const { dom } = await setup(
    '<h2 lang="fr">Title</h2><p dir="rtl">Text <b>bold</b> <i>italic</i></p><img src="/a.png" alt="A graph"><table><caption>Sales</caption><tbody><tr><th scope="col">Year</th><td>2026</td></tr></tbody></table>',
  );
  expect(screen.queryByRole("alert")).toBeNull();
  expect(dom).toHaveAttribute("contenteditable", "true");
});

test("the status line counts characters and words and estimates reading time", async () => {
  await setup("<p>one two three</p><p>four</p>");
  expect(status()).toMatch(/^17 characters/);
  expect(document.body.textContent).toContain("4 words");
  expect(document.body.textContent).toContain("1 min read");
});

test("an empty document reads as 0 min, so the status line never grows", async () => {
  await setup();
  expect(document.body.textContent).toMatch(/0 characters\s*·\s*0 words\s*·\s*0 min read/);
});

test("toolbar marks apply to the selection, report the change, and light up", async () => {
  const { editor, onUpdate } = await setup("<p>make this bold</p>");
  editor.commands.setTextSelection({ from: 6, to: 10 });
  await tool("Bold");
  expect(editor.getHTML()).toBe("<p>make <strong>this</strong> bold</p>");
  expect(onUpdate).toHaveBeenLastCalledWith("<p>make <strong>this</strong> bold</p>", expect.any(Object));
  await waitFor(() => expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true"));
});

test("block tools wrap the current block", async () => {
  const { editor } = await setup("<p>item</p>");
  editor.commands.setTextSelection(2);
  await tool("Bullet list");
  expect(editor.getHTML()).toMatch(/^<ul[^>]*><li><p>item<\/p><\/li><\/ul>/);
  await tool("Bullet list");
  await tool("Quote");
  expect(editor.getHTML()).toMatch(/^<blockquote><p>item<\/p><\/blockquote>/);
});

test("the text style menu sets heading levels and back to normal text", async () => {
  const { editor } = await setup("<p>title</p>");
  editor.commands.setTextSelection(2);
  await fireEvent.keyDown(screen.getByRole("button", { name: "Text style" }), { key: "Enter" });
  await fireEvent.click(await screen.findByRole("menuitem", { name: "Heading 2" }));
  expect(editor.getHTML()).toMatch(/^<h2>title<\/h2>/);
  await fireEvent.keyDown(screen.getByRole("button", { name: "Text style" }), { key: "Enter" });
  await fireEvent.click(await screen.findByRole("menuitem", { name: "Normal text" }));
  expect(editor.getHTML()).toMatch(/^<p>title<\/p>/);
});

test("Link asks for a URL; on an existing link it removes it", async () => {
  const { editor } = await setup("<p>read this</p>");
  editor.commands.setTextSelection({ from: 6, to: 10 });
  await tool("Link");
  await fireEvent.input(await screen.findByLabelText("URL"), { target: { value: "  https://example.com  " } });
  await fireEvent.click(screen.getByRole("button", { name: "Add link" }));
  expect(editor.getHTML()).toContain(
    '<a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com">this</a>',
  );
  editor.commands.setTextSelection(7);
  await tool("Link");
  expect(editor.getHTML()).not.toContain("<a");
});

test("a blank URL adds no link", async () => {
  const { editor } = await setup("<p>read this</p>");
  editor.commands.setTextSelection({ from: 6, to: 10 });
  await tool("Link");
  await fireEvent.click(await screen.findByRole("button", { name: "Add link" }));
  expect(editor.getHTML()).toBe("<p>read this</p>");
});

test("inside a code block, its language and filename can be set", async () => {
  const { editor } = await setup("<pre><code>let x;</code></pre>");
  editor.commands.setTextSelection(2);
  const settings = await screen.findByRole("button", { name: "Code block language and filename" });
  await fireEvent.click(settings);
  await fireEvent.input(await screen.findByLabelText(/Filename|File name|Title/), { target: { value: "  main.ts " } });
  await fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(editor.getAttributes("codeBlock")).toMatchObject({ title: "main.ts", language: null });
});

test("Table inserts a 3×3 table with a header row, and its menu edits it", async () => {
  const { editor } = await setup("<p></p>");
  await tool("Table");
  expect(editor.getHTML().match(/<tr>/g)).toHaveLength(3);
  expect(editor.getHTML()).toContain("<th");
  await fireEvent.keyDown(await screen.findByRole("button", { name: "Edit table" }), { key: "Enter" });
  await fireEvent.click(await screen.findByRole("menuitem", { name: "Row below" }));
  expect(editor.getHTML().match(/<tr>/g)).toHaveLength(4);
  await fireEvent.keyDown(screen.getByRole("button", { name: "Edit table" }), { key: "Enter" });
  await fireEvent.click(await screen.findByRole("menuitem", { name: "Delete table" }));
  expect(editor.getHTML()).not.toContain("<table");
});

test("the Divider tool inserts a horizontal rule", async () => {
  const { editor } = await setup("<p>a</p>");
  editor.commands.setTextSelection(2);
  await tool("Divider");
  expect(editor.getHTML()).toContain("<hr>");
});

const imageInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;
const png = (name: string) => new File(["x"], name, { type: "image/png" });

test("an uploaded image is inserted with a paragraph to keep writing in", async () => {
  const { editor } = await setup("<p></p>");
  await fireEvent.change(imageInput(), { target: { files: [png("a.png")] } });
  await waitFor(() => expect(editor.getHTML()).toContain('src="/api/uploads/img1.webp"'));
  expect(api.calls[0].headers.get("content-type")).toBe("image/webp");
});

test("an unsupported file and a failed upload are both reported", async () => {
  const { editor } = await setup("<p></p>", { "POST /api/uploads": apiError(413, "Image too large") });
  await fireEvent.change(imageInput(), { target: { files: [new File(["x"], "a.pdf", { type: "application/pdf" })] } });
  expect(screen.getByText("Unsupported image type. Use PNG, JPEG, WebP, or GIF.")).toBeInTheDocument();
  await fireEvent.change(imageInput(), { target: { files: [png("a.png")] } });
  await screen.findByText("Image too large");
  expect(editor.getHTML()).not.toContain("<img");
});

test("several images inserted at the cursor stay together, in order", async () => {
  const { editor } = await setup("<p>before</p><p>after</p>");
  editor.commands.setTextSelection(7);
  await fireEvent.change(imageInput(), { target: { files: [png("a.png"), png("b.png")] } });
  await waitFor(() => expect(editor.getHTML()).toContain("img2.webp"));
  const html = editor.getHTML();
  const order = ["before", "img1.webp", "img2.webp", "after"].map((x) => html.indexOf(x));
  expect(order).toEqual(order.toSorted((a, b) => a - b));
});

test("an image's alt text is edited through the dialog and stored trimmed", async () => {
  const { editor, dom } = await setup('<img src="/api/uploads/x.webp"><p></p>');
  dom.dispatchEvent(new CustomEvent(EDIT_ALT_EVENT, { detail: { pos: 0, alt: "" } }));
  const field = await screen.findByLabelText("Alt text");
  await fireEvent.input(field, { target: { value: "  A rabbit  " } });
  await fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(editor.getJSON().content[0].attrs).toMatchObject({ alt: "A rabbit" });
});

test("saving an explicitly decorative image retains an empty alt instead of an unreviewed null", async () => {
  const { editor, dom } = await setup('<img src="/api/uploads/x.webp"><p></p>');
  dom.dispatchEvent(new CustomEvent(EDIT_ALT_EVENT, { detail: { pos: 0, alt: "" } }));
  await screen.findByLabelText("Alt text");
  await fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(editor.getJSON().content[0].attrs!.alt).toBe("");
});

test("alt text isn't written to a position that's no longer the image", async () => {
  const { editor, dom } = await setup('<p>text</p><img src="/api/uploads/x.webp">');
  dom.dispatchEvent(new CustomEvent(EDIT_ALT_EVENT, { detail: { pos: 0, alt: "old" } }));
  await fireEvent.input(await screen.findByLabelText("Alt text"), { target: { value: "new" } });
  await fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(editor.getJSON().content[0].type).toBe("paragraph");
  expect(JSON.stringify(editor.getJSON())).not.toContain('"alt":"new"');
});

test("image settings resize without dragging, preserve the alternative, and support undo", async () => {
  const { editor } = await setup('<img src="/a.png" alt="A cat" width="40%"><p></p>');
  editor.commands.setNodeSelection(0);
  await tool("Image settings");
  expect(await screen.findByLabelText("Image width (%)")).toHaveValue(40);
  await fireEvent.input(screen.getByLabelText("Image width (%)"), { target: { value: "65" } });
  await expectAccessible();
  await fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(editor.getJSON().content[0].attrs).toMatchObject({ width: "65%", alt: "A cat" });
  editor.commands.undo();
  expect(editor.getAttributes("image").width).toBe("40%");
});

test("invalid image widths are explained without updating the image", async () => {
  const { editor, dom } = await setup('<img src="/a.png" alt="A cat" width="40%"><p></p>');
  dom.dispatchEvent(new CustomEvent(EDIT_ALT_EVENT, { detail: { pos: 0, alt: "A cat" } }));
  const width = await screen.findByLabelText("Image width (%)");
  await fireEvent.input(width, { target: { value: "101" } });
  await fireEvent.submit(width.closest("form")!);
  expect(screen.getByRole("alert")).toHaveTextContent("10 to 100 percent");
  expect(editor.getJSON().content[0].attrs!.width).toBe("40%");
});

test("the accessibility review locates an image and updates after repair", async () => {
  const { editor } = await setup('<img src="/a.png"><p></p>');
  await fireEvent.click(screen.getByRole("button", { name: "Check accessibility (1)" }));
  await fireEvent.click(await screen.findByRole("button", { name: "Review image 1" }));
  await fireEvent.input(await screen.findByLabelText("Alt text"), { target: { value: "A cat" } });
  await fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(editor.getJSON().content[0].attrs!.alt).toBe("A cat");
  await screen.findByRole("button", { name: "Check accessibility (0)" });
  expect(screen.getByRole("status")).toHaveTextContent("Manual review is still needed");
});

test("table accessibility settings save a native caption and headers", async () => {
  const { editor } = await setup(
    "<table><tr><td>Month</td><td>Count</td></tr><tr><td>June</td><td>10</td></tr></table>",
  );
  editor.commands.setTextSelection(4);
  await fireEvent.keyDown(await screen.findByRole("button", { name: "Edit table" }), { key: "Enter" });
  await fireEvent.click(await screen.findByRole("menuitem", { name: "Table accessibility" }));
  await fireEvent.input(await screen.findByLabelText("Table caption"), { target: { value: "Monthly sales" } });
  await fireEvent.click(screen.getByRole("checkbox", { name: "Header row" }));
  await expectAccessible();
  await fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(editor.getHTML()).toContain("<caption>Monthly sales</caption>");
  expect(editor.getHTML()).toContain("<th");
  expect(editor.getHTML()).toContain("June");
});

test("the live editing view renders table captions with their names and language", async () => {
  const { dom } = await setup(
    '<table aria-labelledby="sales"><caption id="sales" lang="fr">Sales table</caption><tr><th scope="col">Year</th></tr></table>',
  );
  expect(dom.querySelector("caption")).toHaveTextContent("Sales table");
  expect(dom.querySelector("caption")).toHaveAttribute("lang", "fr");
  expect(dom.querySelector("table")).toHaveAccessibleName("Sales table");
});

test("live table caption edits, removals and undo stay in sync without changing serialized markup", async () => {
  const { editor, dom } = await setup(
    '<table aria-labelledby="sales"><caption id="sales" lang="fr">Sales table</caption><tr><th>Year</th></tr></table>',
  );
  editor.commands.setTextSelection(4);
  editor.commands.updateAttributes("table", {
    caption: "Updated table",
    captionAttributes: { id: "updated", lang: "de" },
    "aria-labelledby": "updated",
  });
  expect(dom.querySelector("table")).toHaveAccessibleName("Updated table");
  expect(dom.querySelector("caption")).toHaveAttribute("id", "updated");
  expect(dom.querySelector("caption")).toHaveAttribute("lang", "de");
  expect(dom.querySelector("caption")).toHaveAttribute("contenteditable", "false");
  expect(editor.getHTML()).not.toContain("contenteditable");
  editor.commands.updateAttributes("table", { caption: null });
  expect(dom.querySelector("caption")).toBeNull();
  editor.commands.undo();
  expect(dom.querySelector("caption")).toHaveTextContent("Sales table");
});

test("table header scope controls cannot add invalid scope attributes to data cells", async () => {
  const { editor } = await setup("<table><tr><td>Data</td></tr></table>");
  editor.commands.setTextSelection(4);
  await fireEvent.keyDown(await screen.findByRole("button", { name: "Edit table" }), { key: "Enter" });
  expect(await screen.findByRole("menuitem", { name: "Header applies to row" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("find supports forward and backward results, alternatives, and no-match feedback", async () => {
  const { editor } = await setup('<p>Sales report</p><img src="/a.png" alt="Sales graph"><p></p>');
  await tool("Find and navigate");
  const input = await screen.findByRole("searchbox", { name: "Find in article" });
  await fireEvent.input(input, { target: { value: "Sales" } });
  expect(screen.getByRole("status")).toHaveTextContent("Result 1 of 2");
  await tool("Next result");
  expect(screen.getByRole("status")).toHaveTextContent("Image description: Sales graph");
  await tool("Previous result");
  await tool("Edit result");
  expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe("Sales");
  await tool("Next result");
  await tool("Edit result");
  expect(await screen.findByLabelText("Alt text")).toHaveValue("Sales graph");
  await tool("Cancel");
  await fireEvent.input(input, { target: { value: "missing" } });
  expect(screen.getByRole("status")).toHaveTextContent("No matches found");
  await expectAccessible();
});

test("document navigation moves editing focus to the chosen element", async () => {
  const { editor, dom } = await setup("<p>Opening</p><h2>Section</h2><p>Body</p>");
  await tool("Find and navigate");
  await fireEvent.keyDown(await screen.findByRole("combobox", { name: "Go to document element" }), { key: "Enter" });
  await fireEvent.pointerUp(await screen.findByRole("option", { name: "Heading 2: Section" }));
  await waitFor(() => expect(editor.isActive("heading", { level: 2 })).toBe(true));
  await waitFor(() => expect(dom).toHaveFocus());
});

test("passages can have an independent language and direction", async () => {
  const { editor } = await setup("<p>Hello world</p>");
  editor.commands.setTextSelection({ from: 1, to: 6 });
  await tool("Text language");
  await fireEvent.input(await screen.findByLabelText("Language tag"), { target: { value: "fr" } });
  await fireEvent.keyDown(screen.getByRole("combobox", { name: "Text direction: Inherit" }), { key: "Enter" });
  await fireEvent.pointerUp(await screen.findByRole("option", { name: "Right to left" }));
  await expectAccessible();
  await tool("Save");
  expect(editor.getHTML()).toContain('<span lang="fr" dir="rtl">Hello</span>');
});

test("invalid passage language tags keep the dialog open with an actionable error", async () => {
  await setup("<p>Hello</p>");
  await tool("Text language");
  await fireEvent.input(await screen.findByLabelText("Language tag"), { target: { value: "not_a_tag" } });
  await tool("Save");
  expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid language tag");
});

test("an image's rendered alternative keeps its declared language in the editing view", async () => {
  const { dom } = await setup('<img src="/a.png" alt="A cat" lang="fr"><p></p>');
  expect(dom.querySelector("img")).toHaveAttribute("lang", "fr");
});

test("editing an alternative does not change an existing non-percentage image width", async () => {
  const { editor, dom } = await setup('<img src="/a.png" alt="Old description" width="400"><p></p>');
  dom.dispatchEvent(new CustomEvent(EDIT_ALT_EVENT, { detail: { pos: 0, alt: "Old description" } }));
  await fireEvent.input(await screen.findByLabelText("Alt text"), { target: { value: "A cat" } });
  await tool("Save");
  expect(editor.getJSON().content[0].attrs!.width).toBe("400");
});

test.for([false, true])(
  "partial text replacement retains source block metadata and both destination remainders (backward: %s)",
  async (backward) => {
    const { editor, onUpdate } = await setup('<p lang="en">Before selected after</p>');
    const before = editor.getHTML();
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, backward ? 16 : 8, backward ? 8 : 16)),
    );
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe("selected");
    pasteHtml(editor, '<p lang="fr" dir="ltr">Bonjour <span lang="de">Welt</span></p>');
    const body = serialized(editor);
    expect(
      [...body.children].map((element) => [element.tagName, element.getAttribute("lang"), element.textContent]),
    ).toEqual([
      ["P", "en", "Before "],
      ["P", "fr", "Bonjour Welt"],
      ["P", "en", " after"],
    ]);
    expect(body.querySelector('span[lang="de"]')).toHaveTextContent("Welt");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    editor.commands.undo();
    expect(editor.getHTML()).toBe(before);
  },
);

test("partial inline paste keeps normal joining while retaining the selected passage's marks", async () => {
  const { editor } = await setup("<p>Before selected after</p>");
  editor.commands.setTextSelection({ from: 8, to: 16 });
  pasteHtml(editor, '<p><span lang="fr" dir="ltr"><strong>Bonjour</strong></span></p>');
  const body = serialized(editor);
  expect(body.children).toHaveLength(1);
  expect(body.firstChild?.textContent).toBe("Before Bonjour after");
  expect(body.querySelector('span[lang="fr"][dir="ltr"] strong')).toHaveTextContent("Bonjour");
  editor.commands.undo();
  expect(editor.getHTML()).toBe("<p>Before selected after</p>");
});

test("cancelling loss review preserves a backward selection spanning two paragraphs", async () => {
  const { editor, onUpdate } = await setup("<p>Before selected</p><p>selected after</p>");
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 25, 8)));
  const selection = editor.state.selection.toJSON();
  const before = editor.getHTML();
  pasteHtml(editor, "<figure><figcaption>Caption</figcaption></figure>");
  await screen.findByRole("dialog", { name: "Review pasted content" });
  await tool("Cancel");
  expect(editor.getHTML()).toBe(before);
  expect(editor.state.selection.toJSON()).toEqual(selection);
  expect(onUpdate).not.toHaveBeenCalled();
  expect(api.calls).toHaveLength(0);
});

test("accepted loss review maps the original partial selection rather than a later cursor", async () => {
  const { editor } = await setup("<p>Before selected after</p>");
  editor.commands.setTextSelection({ from: 8, to: 16 });
  pasteHtml(editor, "<figure><figcaption>Caption</figcaption></figure>");
  await screen.findByRole("dialog", { name: "Review pasted content" });
  editor.commands.insertContentAt(1, "New ");
  editor.commands.setTextSelection(2);
  const edited = editor.getHTML();
  await tool("Paste simplified content");
  expect(editor.state.doc.textContent).toBe("New Before Caption after");
  editor.commands.undo();
  expect(editor.getHTML()).toBe(edited);
});

test.for(["paste", "drop"] as const)(
  "%s of supported passage metadata into a table cell preserves destination relationships",
  async (kind) => {
    const { editor, dom } = await setup(targetTableHtml);
    const pos = textPosition(editor, "alpha") + 2;
    if (kind === "paste") editor.commands.setTextSelection(pos);
    else editor.commands.selectAll();
    const before = editor.getHTML();
    transfer(editor, kind, '<p lang="fr" dir="ltr">Bonjour</p>', [], pos);
    const body = serialized(editor);
    expect(body.querySelectorAll("table")).toHaveLength(1);
    expect(body.querySelectorAll("tr")).toHaveLength(2);
    expect(body.querySelector('[headers="target-left"]')).toHaveTextContent(
      kind === "paste" ? "alBonjourpha" : "Bonjouralpha",
    );
    expect(body.querySelector('[headers="target-left"] p[lang="fr"]')).toHaveAttribute("dir", "ltr");
    expect(body.querySelector('[headers="target-right"]')).toHaveTextContent("beta");
    expect(dom.querySelector("table")).toHaveAccessibleName("Destination table");
    expect(screen.queryByRole("dialog")).toBeNull();
    editor.commands.undo();
    expect(editor.getHTML()).toBe(before);
  },
);

test("loss-review cancellation preserves a rectangular cell selection, table caption and all cells", async () => {
  const { editor, onUpdate } = await setup(targetTableHtml);
  const selection = selectTargetCells(editor);
  const before = editor.getHTML();
  pasteHtml(editor, '<figure><img src="file:///chart.png" alt="Chart"><figcaption>Caption</figcaption></figure>', [
    png("chart.png"),
  ]);
  await screen.findByRole("dialog", { name: "Review pasted content" });
  await tool("Cancel");
  expect(editor.state.selection).toBeInstanceOf(CellSelection);
  expect(editor.state.selection.toJSON()).toEqual(selection);
  expect(editor.getHTML()).toBe(before);
  expect(onUpdate).not.toHaveBeenCalled();
  expect(api.calls).toHaveLength(0);
});

test("accepting simplified content over selected cells preserves the destination grid and is undoable", async () => {
  const { editor, dom } = await setup(targetTableHtml);
  selectTargetCells(editor);
  const before = editor.getHTML();
  pasteHtml(editor, '<figure><p lang="fr">Replacement</p><figcaption>Caption</figcaption></figure>');
  await fireEvent.click(await screen.findByRole("button", { name: "Paste simplified content" }));
  const body = serialized(editor);
  expect(body.querySelectorAll("table")).toHaveLength(1);
  expect(body.querySelectorAll("td")).toHaveLength(2);
  expect(body.querySelector('[headers="target-right"]')).toHaveTextContent("ReplacementCaption");
  expect(body.querySelector('[headers="target-right"] p[lang="fr"]')).toHaveTextContent("Replacement");
  expect(body.querySelector('[headers="target-left"]')?.textContent).toBe("");
  expect(dom.querySelector("table")).toHaveAccessibleName("Destination table");
  expect(TableMap.get(editor.state.doc.firstChild!).problems).toBeNull();
  editor.commands.undo();
  expect(editor.getHTML()).toBe(before);
  expect(editor.state.selection).toBeInstanceOf(CellSelection);
});

test.for(["paste", "drop"] as const)(
  "%s of a complex table preserves caption/header associations at a partial text target",
  async (kind) => {
    const { editor, dom } = await setup("<p>Before after</p>");
    editor.commands.setTextSelection(8);
    const before = editor.getHTML();
    transfer(editor, kind, complexTableHtml, [], 8);
    const body = serialized(editor);
    if (kind === "paste") {
      expect(body.firstChild?.textContent).toBe("Before ");
      expect(body.lastChild?.textContent).toBe("after");
    } else expect(body.firstChild?.textContent).toBe("Before after");
    expect(body.querySelector("#region")).toHaveAttribute("rowspan", "2");
    expect(body.querySelector("#totals")).toHaveAttribute("colspan", "2");
    expect(body.querySelector('[headers="north count"]')).toHaveTextContent("20");
    expect(body.querySelector("#sales-notes")).toHaveTextContent("Values exclude returns.");
    expect(dom.querySelector("table")).toHaveAccessibleName("Sales by region");
    expect(dom.querySelector("table")).toHaveAccessibleDescription("Values exclude returns.");
    expect(screen.queryByRole("dialog")).toBeNull();
    editor.commands.undo();
    expect(editor.getHTML()).toBe(before);
  },
);

test.for(["paste", "drop"] as const)(
  "%s of a rich caption requires review before changing the table target",
  async (kind) => {
    const { editor, onUpdate } = await setup(targetTableHtml);
    const pos = textPosition(editor, "alpha");
    editor.commands.setTextSelection(pos);
    const before = editor.getHTML();
    transfer(
      editor,
      kind,
      '<table><caption>Sales <span lang="fr">annuelles</span></caption><tr><td>20</td></tr></table>',
      [],
      pos,
    );
    expect(
      await screen.findByRole("dialog", {
        name: kind === "paste" ? "Review pasted content" : "Review dropped content",
      }),
    ).toHaveTextContent("span lang: fr");
    expect(editor.getHTML()).toBe(before);
    await tool("Cancel");
    expect(editor.getHTML()).toBe(before);
    expect(onUpdate).not.toHaveBeenCalled();
  },
);

test.for(["paste", "drop"] as const)(
  "an asynchronous image %s maps its table-cell target and retains its long-description association",
  async (kind) => {
    const upload = Promise.withResolvers<Response>();
    const { editor, dom } = await setup(targetTableHtml, { "POST /api/uploads": () => upload.promise });
    const pos = textPosition(editor, "alpha") + 2;
    if (kind === "paste") editor.commands.setTextSelection(pos);
    else editor.commands.selectAll();
    transfer(
      editor,
      kind,
      '<img src="file:///chart.png" alt="Sales chart" lang="en" aria-describedby="chart-description"><p id="chart-description">Sales doubled.</p>',
      [png("chart.png")],
      pos,
    );
    await waitFor(() => expect(api.calls).toHaveLength(1));
    editor.commands.insertContentAt(0, { type: "paragraph", content: [{ type: "text", text: "New opening" }] });
    editor.commands.setTextSelection(2);
    const beforeInsertion = editor.getHTML();
    upload.resolve(Response.json({ url: "/api/uploads/rehosted.webp" }));
    await waitFor(() => expect(editor.getHTML()).toContain("rehosted.webp"));
    const body = serialized(editor);
    const cell = body.querySelector('[headers="target-left"]')!;
    expect(cell.querySelector("img")).toHaveAttribute("aria-describedby", "chart-description");
    expect(cell.querySelector("#chart-description")).toHaveTextContent("Sales doubled.");
    expect(cell.textContent).toBe(kind === "paste" ? "alSales doubled.pha" : "Sales doubled.alpha");
    expect(body.querySelector('[headers="target-right"]')).toHaveTextContent("beta");
    expect(dom.querySelector("img")).toHaveAccessibleDescription("Sales doubled.");
    expect(body.firstChild).toHaveTextContent("New opening");
    expect(screen.queryByRole("dialog")).toBeNull();
    editor.commands.undo();
    expect(editor.getHTML()).toBe(beforeInsertion);
  },
);

test.for(["paste", "drop"] as const)("failed image %s into a cell leaves the entire table unchanged", async (kind) => {
  const { editor, onUpdate } = await setup(targetTableHtml, {
    "POST /api/uploads": apiError(413, "Image too large"),
  });
  const pos = textPosition(editor, "alpha");
  editor.commands.setTextSelection({ from: pos, to: pos + 5 });
  const selected = editor.state.selection.toJSON();
  const before = editor.getHTML();
  transfer(editor, kind, '<img src="file:///chart.png" alt="Chart">', [png("chart.png")], pos);
  expect(await screen.findByRole("alert")).toHaveTextContent("Image too large");
  expect(editor.getHTML()).toBe(before);
  if (kind === "paste") expect(editor.state.selection.toJSON()).toEqual(selected);
  expect(onUpdate).not.toHaveBeenCalled();
});

test.for(["paste", "drop"] as const)(
  "HTML/file image-count mismatch is rejected before %s uploads or table edits",
  async (kind) => {
    const { editor, onUpdate } = await setup(targetTableHtml);
    const pos = textPosition(editor, "alpha");
    editor.commands.setTextSelection(pos);
    const before = editor.getHTML();
    transfer(
      editor,
      kind,
      '<img src="file:///one.png" alt="First"><img src="file:///two.png" alt="Second">',
      [png("one.png")],
      pos,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be matched");
    expect(editor.getHTML()).toBe(before);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(api.calls).toHaveLength(0);
  },
);

test.for(["paste", "drop"] as const)(
  "%s preserves unique description IDs and the correct image association",
  async (kind) => {
    const { editor } = await setup('<p id="details">Existing description</p><p>Target</p>');
    const pos = textPosition(editor, "Target");
    editor.commands.setTextSelection(pos);
    const before = editor.getHTML();
    transfer(
      editor,
      kind,
      '<img src="/new.png" alt="New chart" aria-describedby="details"><p id="details">New description</p>',
      [],
      pos,
    );
    const result = serialized(editor);
    expect(
      result.querySelectorAll('[id="details"]').length,
      "description IDs must stay unique or insertion must wait for review",
    ).toBe(1);
    if (result.querySelector("img")) {
      expect(editor.view.dom.querySelector("img")).toHaveAccessibleDescription("New description");
    } else {
      expect(editor.getHTML()).toBe(before);
      await screen.findByRole("dialog");
    }
  },
);

test("a copied table-cell fragment is held for review rather than silently inserting dangling headers", async () => {
  const { editor } = await setup(complexTableHtml);
  const table = editor.state.doc.firstChild!;
  const map = TableMap.get(table);
  const selection = CellSelection.create(editor.state.doc, 1 + map.map[7], 1 + map.map[8]);
  const copied = editor.view.serializeForClipboard(selection.content()).dom.innerHTML;
  editor.commands.setContent({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Destination" }] }],
  });
  editor.commands.selectAll();
  const before = editor.getHTML();
  pasteHtml(editor, copied);
  const body = serialized(editor);
  const dangling = [...body.querySelectorAll("[headers]")].flatMap((cell) =>
    cell
      .getAttribute("headers")!
      .split(/\s+/)
      .filter((id) => !body.querySelector(`[id="${id}"]`)),
  );
  expect(dangling, "header references must resolve or insertion must wait for review").toEqual([]);
  expect(editor.getHTML()).toBe(before);
  expect(await screen.findByRole("dialog")).toHaveTextContent("element: table");
});

test("a copied image waits for review when its long description is outside the selection", async () => {
  const { editor } = await setup(
    '<img src="/chart.png" alt="Chart" aria-describedby="details"><p id="details">Full description</p>',
  );
  editor.commands.setNodeSelection(0);
  const copied = editor.view.serializeForClipboard(editor.state.selection.content()).dom.innerHTML;
  editor.commands.setContent({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Destination" }] }],
  });
  editor.commands.selectAll();
  const before = editor.getHTML();
  pasteHtml(editor, copied);
  const body = serialized(editor);
  expect(
    body.querySelector('[aria-describedby="details"]') === null || body.querySelector("#details") !== null,
    "the copied image must retain a resolvable description or wait for review",
  ).toBe(true);
  if (body.querySelector("img")) {
    expect(editor.view.dom.querySelector("img")).toHaveAccessibleDescription("Full description");
  } else {
    expect(editor.getHTML()).toBe(before);
    await screen.findByRole("dialog");
  }
});

test.for(["paste", "drop"] as const)(
  "%s with a missing description target can cancel without uploading or changing the selection",
  async (kind) => {
    const { editor, onUpdate } = await setup("<p>Original</p>");
    editor.commands.selectAll();
    const before = editor.getHTML();
    const selection = editor.state.selection.toJSON();
    transfer(
      editor,
      kind,
      '<img src="file:///chart.png" alt="Chart" aria-describedby="missing">',
      [png("chart.png")],
      4,
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("missing aria-describedby target: missing");
    expect(dialog).toHaveTextContent("include the referenced descriptions or headers");
    await expectAccessible();
    expect(screen.queryByRole("button", { name: /simplified content/ })).toBeNull();
    expect(editor.getHTML()).toBe(before);
    expect(api.calls).toHaveLength(0);
    await tool("Cancel");
    expect(editor.state.selection.toJSON()).toEqual(selection);
    expect(onUpdate).not.toHaveBeenCalled();
  },
);

test("replacing an existing description cannot silently break an image outside the selected range", async () => {
  const { editor, onUpdate } = await setup(
    '<img src="/chart.png" alt="Chart" aria-describedby="details"><p id="details">Details</p>',
  );
  editor.commands.setNodeSelection(1);
  const before = editor.getHTML();
  pasteHtml(editor, "<p>Replacement</p>");
  expect(await screen.findByRole("dialog")).toHaveTextContent("missing aria-describedby target: details");
  expect(editor.getHTML()).toBe(before);
  expect(onUpdate).not.toHaveBeenCalled();
});

test("replacing a description with the same ID keeps surviving references rather than renaming its target", async () => {
  const { editor, dom } = await setup(
    '<img src="/chart.png" alt="Chart" aria-describedby="details"><p id="details">Details</p>',
  );
  editor.commands.setNodeSelection(1);
  pasteHtml(editor, '<p id="details">Updated details</p>');
  expect(dom.querySelector("img")).toHaveAccessibleDescription("Updated details");
  expect(dom.querySelectorAll('[id="details"]')).toHaveLength(1);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("ambiguous source IDs require repair rather than being assigned invented associations", async () => {
  const { editor, onUpdate } = await setup("<p>Original</p>");
  editor.commands.selectAll();
  pasteHtml(
    editor,
    '<p id="details">One</p><p id="details">Two</p><img src="/chart.png" alt="Chart" aria-describedby="details">',
  );
  expect(await screen.findByRole("dialog")).toHaveTextContent("duplicate ID: details");
  expect(editor.getHTML()).toBe("<p>Original</p>");
  expect(onUpdate).not.toHaveBeenCalled();
});

test("an upload remaps collisions against the current document rather than an earlier preview", async () => {
  const upload = Promise.withResolvers<Response>();
  const { editor, dom } = await setup('<p id="details">Existing description</p><p>Target</p>', {
    "POST /api/uploads": () => upload.promise,
  });
  editor.commands.setTextSelection(textPosition(editor, "Target"));
  pasteHtml(
    editor,
    '<img src="file:///chart.png" alt="Chart" aria-describedby="details"><p id="details">Transferred description</p>',
    [png("chart.png")],
  );
  await waitFor(() => expect(api.calls).toHaveLength(1));
  editor.commands.insertContentAt(0, {
    type: "paragraph",
    attrs: { id: "details-copy" },
    content: [{ type: "text", text: "Reserved during upload" }],
  });
  const beforeInsertion = editor.getHTML();
  upload.resolve(Response.json({ url: "/api/uploads/rehosted.webp" }));
  await waitFor(() => expect(dom.querySelector("img")).toHaveAccessibleDescription("Transferred description"));
  expect(dom.querySelector("img")).toHaveAttribute("aria-describedby", "details-copy-2");
  expect(dom.querySelectorAll('[id="details"]')).toHaveLength(1);
  expect(dom.querySelector("#details-copy")).toHaveTextContent("Reserved during upload");
  editor.commands.undo();
  expect(editor.getHTML()).toBe(beforeInsertion);
});

test("an upload whose external description target disappears waits for repair without inserting stale references", async () => {
  const upload = Promise.withResolvers<Response>();
  const { editor } = await setup('<p id="details">Existing description</p><p>Target</p>', {
    "POST /api/uploads": () => upload.promise,
  });
  editor.commands.setTextSelection(textPosition(editor, "Target"));
  pasteHtml(editor, '<img src="file:///chart.png" alt="Chart" aria-describedby="details">', [png("chart.png")]);
  await waitFor(() => expect(api.calls).toHaveLength(1));
  editor.commands.deleteRange({ from: 0, to: editor.state.doc.firstChild!.nodeSize });
  const edited = editor.getHTML();
  upload.resolve(Response.json({ url: "/api/uploads/rehosted.webp" }));
  expect(await screen.findByRole("dialog")).toHaveTextContent("missing aria-describedby target: details");
  expect(editor.getHTML()).toBe(edited);
  expect(api.calls).toHaveLength(1);
  await tool("Cancel");
  expect(editor.getHTML()).toBe(edited);
});

test("an accepted structural simplification is rechecked if its description target was removed during review", async () => {
  const { editor } = await setup('<p id="details">Existing description</p><p>Target</p>');
  editor.commands.setTextSelection(textPosition(editor, "Target"));
  pasteHtml(
    editor,
    '<figure><img src="/chart.png" alt="Chart" aria-describedby="details"><figcaption>Caption</figcaption></figure>',
  );
  await screen.findByRole("dialog");
  editor.commands.deleteRange({ from: 0, to: editor.state.doc.firstChild!.nodeSize });
  const edited = editor.getHTML();
  await tool("Paste simplified content");
  expect(await screen.findByRole("dialog")).toHaveTextContent("missing aria-describedby target: details");
  expect(screen.queryByRole("button", { name: "Paste simplified content" })).toBeNull();
  expect(editor.getHTML()).toBe(edited);
});

test("replacing a pre-existing broken image cannot hide a new image's missing description", async () => {
  const { editor } = await setup('<img src="/old.png" alt="Old chart" aria-describedby="missing">');
  editor.commands.selectAll();
  pasteHtml(editor, '<img src="/new.png" alt="New chart" aria-describedby="missing">');
  expect(editor.getHTML()).toContain('src="/old.png"');
  expect(await screen.findByRole("dialog")).toHaveTextContent("missing aria-describedby target: missing");
});

test("undoing a remapped transfer leaves an immediately preceding paste intact", async () => {
  const { editor } = await setup("<p>Original</p>");
  editor.commands.selectAll();
  pasteHtml(editor, '<p id="details">Existing description</p><p>Target</p>');
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  const beforeSecondPaste = editor.getHTML();
  pasteHtml(
    editor,
    '<img src="/chart.png" alt="Chart" aria-describedby="details"><p id="details">Transferred description</p>',
  );
  expect(serialized(editor).querySelector("img")).toHaveAttribute("aria-describedby", "details-copy");
  editor.commands.undo();
  expect(editor.getHTML()).toBe(beforeSecondPaste);
});

test("an immediately following plain paste does not undo the remapped transfer with it", async () => {
  const { editor } = await setup('<p id="details">Existing description</p><p>Target</p>');
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  pasteHtml(
    editor,
    '<img src="/chart.png" alt="Chart" aria-describedby="details"><p id="details">Transferred description</p>',
  );
  const beforePlainPaste = editor.getHTML();
  pasteHtml(editor, "<p>More text</p>");
  expect(editor.getHTML()).toContain("More text");
  editor.commands.undo();
  expect(editor.getHTML()).toBe(beforePlainPaste);
});
