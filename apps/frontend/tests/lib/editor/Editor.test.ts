import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Content, Editor as TiptapEditor } from "@tiptap/core";
import { tick } from "svelte";
import { beforeEach, expect, test, vi } from "vitest";
import Editor from "#lib/editor/Editor.svelte";
import { EDIT_ALT_EVENT } from "#lib/editor/resizable-image.js";
import { expectAccessible } from "../../accessibility";
import { apiError, fakeFetch } from "../../fakeFetch";

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

test("upload failures are announced to assistive technology", async () => {
  await setup("<p></p>", { "POST /api/uploads": apiError(413, "Image too large") });
  await fireEvent.change(imageInput(), { target: { files: [png("a.png")] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Image too large");
});

test("stored HTML is parsed as HTML, not escaped as Markdown text", async () => {
  const { editor } = await setup("<p>alpha <strong>beta</strong></p>");
  expect(editor.getHTML()).toBe("<p>alpha <strong>beta</strong></p>");
});

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
  await fireEvent.keyDown(await screen.findByRole("button", { name: "Go to document element" }), { key: "Enter" });
  await fireEvent.pointerUp(await screen.findByRole("option", { name: "Heading 2: Section" }));
  await waitFor(() => expect(editor.isActive("heading", { level: 2 })).toBe(true));
  await waitFor(() => expect(dom).toHaveFocus());
});

test("passages can have an independent language and direction", async () => {
  const { editor } = await setup("<p>Hello world</p>");
  editor.commands.setTextSelection({ from: 1, to: 6 });
  await tool("Text language");
  await fireEvent.input(await screen.findByLabelText("Language tag"), { target: { value: "fr" } });
  await fireEvent.keyDown(screen.getByRole("button", { name: "Text direction: Inherit" }), { key: "Enter" });
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
