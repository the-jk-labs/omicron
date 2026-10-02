import Editor from "$lib/editor/Editor.svelte";
import { EDIT_ALT_EVENT } from "$lib/editor/resizable-image";
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Editor as TiptapEditor } from "@tiptap/core";
import { beforeEach, expect, test, vi } from "vitest";
import { apiError, fakeFetch } from "../../fakeFetch";

vi.mock(import("$lib/editor/image"), async (importOriginal) => ({
  ...(await importOriginal()),
  prepareImage: async (file: Blob) => ({ blob: file, type: "image/webp" }),
}));
vi.mock("emoji-picker-element", () => ({}));

beforeEach(() => {
  // ProseMirror measures ranges when focusing/scrolling; jsdom has no layout.
  Object.assign(Range.prototype, {
    getClientRects: () => [],
    getBoundingClientRect: () => new DOMRect(),
  });
  document.elementFromPoint = () => null;
});

let api: ReturnType<typeof fakeFetch>;
async function setup(content?: string, routes: Parameters<typeof fakeFetch>[0] = {}) {
  let n = 0;
  api = fakeFetch({ "POST /api/uploads": () => Response.json({ url: `/api/uploads/img${++n}.webp` }), ...routes });
  vi.stubGlobal("fetch", api.fetch);
  const onUpdate = vi.fn<(html: string, json: unknown) => void>();
  render(Editor, { props: { onUpdate, content } });
  const dom = await waitFor(() => {
    const el = document.querySelector<HTMLElement & { editor?: TiptapEditor }>(".tiptap");
    if (!el?.editor) throw new Error("editor not mounted");
    return el;
  });
  return { editor: dom.editor!, dom, onUpdate };
}

const tool = (label: string) => fireEvent.click(screen.getByRole("button", { name: label }));
const status = () => document.body.textContent!.match(/[\d,]+ characters?.*?(min read|words?)/)?.[0];

test("stored HTML is parsed as HTML, not escaped as Markdown text", async () => {
  const { editor } = await setup("<p>alpha <strong>beta</strong></p>");
  expect(editor.getHTML()).toBe("<p>alpha <strong>beta</strong></p>");
});

test("the status line counts characters and words and estimates reading time", async () => {
  await setup("<p>one two three</p><p>four</p>");
  expect(status()).toMatch(/^17 characters/);
  expect(document.body.textContent).toContain("4 words");
  expect(document.body.textContent).toContain("1 min read");
});

test("an empty document shows no reading time", async () => {
  await setup();
  expect(document.body.textContent).toContain("0 words");
  expect(document.body.textContent).not.toContain("min read");
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
  expect(api.calls[0]!.headers.get("content-type")).toBe("image/webp");
});

test("an unsupported file and a failed upload are both reported", async () => {
  const { editor } = await setup("<p></p>", { "POST /api/uploads": apiError(413, "Image too large") });
  await fireEvent.change(imageInput(), { target: { files: [new File(["x"], "a.pdf", { type: "application/pdf" })] } });
  expect(screen.getByText("Unsupported image type. Use PNG, JPEG, WebP, or GIF.")).toBeInTheDocument();
  await fireEvent.change(imageInput(), { target: { files: [png("a.png")] } });
  await screen.findByText("Image too large");
  expect(editor.getHTML()).not.toContain("<img");
});

// BUG: without a drop position, each image is inserted at the cursor and then
// `focus("end")` moves the cursor to the end of the document. A second image
// (pasting two screenshots, say) lands at the very end of the article instead
// of after the first, and even a single paste mid-article throws the caret to
// the bottom. The code's own comment promises the original order.
test.fails("BUG: several images inserted at the cursor stay together, in order", async () => {
  const { editor } = await setup("<p>before</p><p>after</p>");
  editor.commands.setTextSelection(7);
  await fireEvent.change(imageInput(), { target: { files: [png("a.png"), png("b.png")] } });
  await waitFor(() => expect(editor.getHTML()).toContain("img2.webp"));
  const html = editor.getHTML();
  expect(html.indexOf("img2.webp")).toBeLessThan(html.indexOf("after"));
});

test("an image's alt text is edited through the dialog and stored trimmed", async () => {
  const { editor, dom } = await setup('<img src="/api/uploads/x.webp"><p></p>');
  dom.dispatchEvent(new CustomEvent(EDIT_ALT_EVENT, { detail: { pos: 0, alt: "" } }));
  const field = await screen.findByLabelText("Alt text");
  await fireEvent.input(field, { target: { value: "  A rabbit  " } });
  await fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(editor.getJSON().content![0]!.attrs).toMatchObject({ alt: "A rabbit" });
});

test("alt text isn't written to a position that's no longer the image", async () => {
  const { editor, dom } = await setup('<p>text</p><img src="/api/uploads/x.webp">');
  dom.dispatchEvent(new CustomEvent(EDIT_ALT_EVENT, { detail: { pos: 0, alt: "old" } }));
  await fireEvent.input(await screen.findByLabelText("Alt text"), { target: { value: "new" } });
  await fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(editor.getJSON().content![0]!.type).toBe("paragraph");
  expect(JSON.stringify(editor.getJSON())).not.toContain('"alt":"new"');
});
