// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import CustomSectionEditor from "#lib/components/CustomSectionEditor.svelte";
import { apiError, fakeFetch } from "../../fakeFetch";

let api: ReturnType<typeof fakeFetch>;
function setup(value = "", routes: Parameters<typeof fakeFetch>[0] = {}, maxLength = 20_000) {
  api = fakeFetch({
    "POST /api/users/me/custom-section/preview": (req) =>
      req.json().then((b: { customSection: string }) => Response.json({ html: `<p>${b.customSection}</p>` })),
    ...routes,
  });
  vi.stubGlobal("fetch", api.fetch);
  return render(CustomSectionEditor, { props: { value, maxLength } });
}

const area = () => screen.getByRole("textbox") as HTMLTextAreaElement;
async function select(start: number, end = start) {
  area().focus();
  area().setSelectionRange(start, end);
}
const tool = (label: string) => fireEvent.click(screen.getByRole("button", { name: label }));
async function openTab(name: string) {
  const t = screen.getByRole("tab", { name });
  await fireEvent.mouseDown(t);
  await fireEvent.click(t);
}

test("counts characters against the limit", () => {
  setup("hello", {}, 1000);
  expect(screen.getByText("5/1,000")).toBeInTheDocument();
});

test.for([
  ["Bold", "**bold text**"],
  ["Italic", "_italic text_"],
  ["Strikethrough", "~~struck text~~"],
  ["Inline code", "`code`"],
  ["Link", "[label](https://)"],
  ["Image", "![alt text](https://)"],
])("%s inserts a placeholder when nothing is selected", async ([label, expected]) => {
  setup();
  await select(0);
  await tool(label);
  expect(area()).toHaveValue(expected);
});

test("wrapping uses the selection and keeps it selected", async () => {
  setup("say hello now");
  await select(4, 9);
  await tool("Bold");
  expect(area()).toHaveValue("say **hello** now");
  await waitFor(() => expect([area().selectionStart, area().selectionEnd]).toEqual([6, 11]));
});

test("line tools prefix every selected line, numbering numbered lists", async () => {
  setup("one\ntwo\nthree");
  await select(1, 5);
  await tool("Numbered list");
  expect(area()).toHaveValue("1. one\n2. two\nthree");
});

test.for([
  ["Heading", "## Heading"],
  ["Bullet list", "- List item"],
  ["Task list", "- [ ] To do"],
  ["Quote", "> Quoted text"],
])("%s on an empty section inserts its placeholder", async ([label, expected]) => {
  setup();
  await select(0);
  await tool(label);
  expect(area()).toHaveValue(expected);
});

test("a mid-line cursor marks its whole line", async () => {
  setup("first\nsecond");
  await select(8);
  await tool("Quote");
  expect(area()).toHaveValue("first\n> second");
});

test("blocks are padded onto their own paragraph", async () => {
  setup("text");
  await select(4);
  await tool("Divider");
  expect(area()).toHaveValue("text\n\n---\n");
  await select(area().value.length);
  await tool("Code block");
  expect(area()).toHaveValue("text\n\n---\n\n```\ncode\n```\n");
});

test("a block at the very start needs no padding", async () => {
  setup();
  await select(0);
  await tool("Table");
  expect(area().value.startsWith("| Column | Column |")).toBe(true);
});

test("an insertion that would pass the limit is refused", async () => {
  setup("12345", {}, 8);
  await select(5);
  await tool("Bold");
  expect(area()).toHaveValue("12345");
});

test("the preview renders through the server, once per source", async () => {
  setup("# Hi");
  await openTab("Preview");
  await screen.findByText("# Hi");
  await openTab("Write");
  await openTab("Preview");
  expect(api.calls).toHaveLength(1);
  await openTab("Write");
  await fireEvent.input(area(), { target: { value: "changed" } });
  await openTab("Preview");
  await screen.findByText("changed");
  expect(api.calls).toHaveLength(2);
});

test("an empty section previews without a request", async () => {
  setup("   ");
  await openTab("Preview");
  expect(screen.getByText("Nothing to preview yet.")).toBeInTheDocument();
  expect(api.calls).toHaveLength(0);
});

test("a preview failure is shown", async () => {
  setup("x", { "POST /api/users/me/custom-section/preview": apiError(413, "Too long to render") });
  await openTab("Preview");
  await screen.findByText("Too long to render");
});

test("a slow preview of old text doesn't show after the text is cleared", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  setup("old text", {
    "POST /api/users/me/custom-section/preview": async () => {
      await gate;
      return Response.json({ html: "<p>old text</p>" });
    },
  });
  await openTab("Preview");
  await screen.findByText("Rendering…", { exact: false });
  await openTab("Write");
  await fireEvent.input(area(), { target: { value: "" } });
  await openTab("Preview");
  release();
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByText("old text")).toBe(null);
});
