import { goto } from "$app/navigation";
import type { Post } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import EditPage from "../../../../../src/routes/posts/[id]/edit/+page.svelte";
import { apiError, fakeFetch } from "../../../../fakeFetch";
import { post } from "../../../../fixtures";

vi.mock(
  import("$lib/editor/Editor.svelte"),
  async () =>
    ({
      default: (await import("../../../../mocks/EditorStub.svelte")).default,
    }) as never,
);

const ID = post().id;
let api: ReturnType<typeof fakeFetch>;
function setup(p: Partial<Post> = {}, routes: Parameters<typeof fakeFetch>[0] = {}) {
  api = fakeFetch({
    [`PATCH /api/posts/${ID}`]: { post: { id: ID, slug: "new-slug" } },
    "*": apiError(404),
    ...routes,
  });
  vi.stubGlobal("fetch", api.fetch);
  return render(EditPage, {
    props: { data: { post: post({ summary: "Old summary", tags: [{ slug: "deno", name: "deno" }], ...p }) } as never },
  });
}

const title = () => screen.getByPlaceholderText("Title");
// BannerPicker loads the photo providers on mount; only the save matters here.
const saves = () => api.calls.filter((c) => c.method === "PATCH");
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));

test("is seeded from the post, with Cancel back to it", async () => {
  setup();
  expect(title()).toHaveValue("Hello world");
  expect(screen.getByRole("button", { name: "Remove tag deno" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/@ada/hello-world");
  const editor = await screen.findByRole("textbox", { name: "Body" });
  expect(editor).toHaveAttribute("data-content", "<p>Body</p>");
});

test("saving sends every field and follows the post to its new slug", async () => {
  setup({ coverUrl: "/api/uploads/b.webp", language: "de" });
  await fireEvent.input(title(), { target: { value: "  New title " } });
  await save();
  await waitFor(() => expect(goto).toHaveBeenCalledWith("/@ada/new-slug"));
  expect(saves()[0]!.body).toEqual({
    title: "New title",
    contentHtml: "<p>Body</p>",
    contentJson: null,
    language: "de",
    summary: "Old summary",
    coverUrl: "/api/uploads/b.webp",
    coverCredit: null,
    tags: ["deno"],
  });
});

test("an emptied summary is saved as cleared", async () => {
  setup();
  const summary = screen.getByDisplayValue("Old summary");
  await fireEvent.input(summary, { target: { value: "   " } });
  await save();
  await waitFor(() => expect(saves()).toHaveLength(1));
  expect((saves()[0]!.body as { summary: unknown }).summary).toBe(null);
});

test("edited body content is what gets saved", async () => {
  setup();
  await fireEvent.input(await screen.findByRole("textbox", { name: "Body" }), { target: { value: "Rewritten" } });
  await save();
  await waitFor(() => expect(saves()).toHaveLength(1));
  expect(saves()[0]!.body).toMatchObject({
    contentHtml: "<p>Rewritten</p>",
    contentJson: { type: "doc", text: "Rewritten" },
  });
});

test.for([
  ["title", "A blog post must have a title."],
  ["body", "Write something first."],
] as const)("an empty %s is refused before saving", async ([what, message]) => {
  setup();
  if (what === "title") await fireEvent.input(title(), { target: { value: "  " } });
  else await fireEvent.input(await screen.findByRole("textbox", { name: "Body" }), { target: { value: "" } });
  await save();
  expect(screen.getByText(message)).toBeInTheDocument();
  expect(saves()).toHaveLength(0);
});

test("a failed save is shown and Save comes back", async () => {
  setup({}, { [`PATCH /api/posts/${ID}`]: apiError(409, "Slug conflict") });
  await save();
  await screen.findByText("Slug conflict");
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  expect(goto).not.toHaveBeenCalled();
});
