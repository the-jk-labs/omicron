import TagInput from "$lib/components/TagInput.svelte";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fakeFetch } from "../../fakeFetch";

let suggest: ReturnType<typeof fakeFetch>;
beforeEach(() => {
  vi.useFakeTimers();
  suggest = fakeFetch({
    "GET /api/tags/suggest": (req) => {
      const q = new URL(req.url).searchParams.get("q");
      return Response.json({
        tags: [
          { slug: q, name: q, postCount: 9 },
          { slug: "perseid", name: "perseid", postCount: 4 },
          { slug: "astronomy", name: "astronomy", postCount: 2 },
        ],
      });
    },
  });
  vi.stubGlobal("fetch", suggest.fetch);
});
afterEach(() => {
  vi.useRealTimers();
});

const input = () => screen.getByRole("textbox");
const chips = () => screen.queryAllByRole("button", { name: /^Remove tag / }).map((b) => b.getAttribute("aria-label"));

async function type(text: string) {
  await fireEvent.input(input(), { target: { value: text } });
}

test.for(["Enter", ",", " "])("%o commits the normalized tag", async (key) => {
  render(TagInput, { props: { tags: [] } });
  await type("#Deno.Land");
  await fireEvent.keyDown(input(), { key });
  expect(chips()).toEqual(["Remove tag denoland"]);
  expect(input()).toHaveValue("");
});

test("duplicates and empty input are ignored", async () => {
  render(TagInput, { props: { tags: ["deno"] } });
  await type("DENO");
  await fireEvent.keyDown(input(), { key: "Enter" });
  await type("###");
  await fireEvent.keyDown(input(), { key: "Enter" });
  expect(chips()).toEqual(["Remove tag deno"]);
});

test("the limit hides the input", async () => {
  render(TagInput, { props: { tags: ["a"], max: 2 } });
  await type("b");
  await fireEvent.keyDown(input(), { key: "Enter" });
  expect(screen.queryByRole("textbox")).toBe(null);
  expect(chips()).toHaveLength(2);
});

test("backspace on an empty input removes the last tag; the × removes any", async () => {
  render(TagInput, { props: { tags: ["a", "b", "c"] } });
  await fireEvent.keyDown(input(), { key: "Backspace" });
  expect(chips()).toEqual(["Remove tag a", "Remove tag b"]);
  await fireEvent.click(screen.getByRole("button", { name: "Remove tag a" }));
  expect(chips()).toEqual(["Remove tag b"]);
});

test("suggestions are debounced, exclude the draft and chosen tags, and commit on press", async () => {
  render(TagInput, { props: { tags: ["astronomy"] } });
  await type("perc");
  expect(suggest.fetch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(200);
  await waitFor(() => screen.getByRole("listbox"));
  expect(suggest.calls[0].path).toBe("/api/tags/suggest?q=perc");
  const options = screen.getAllByRole("option").map((o) => o.textContent);
  expect(options).toEqual([expect.stringContaining("#perseid")]);
  await fireEvent.mouseDown(screen.getByRole("button", { name: /perseid/ }));
  expect(chips()).toEqual(["Remove tag astronomy", "Remove tag perseid"]);
  expect(screen.queryByRole("listbox")).toBe(null);
});

test("no lookup for a one-character draft; Escape closes the list; a failed lookup shows none", async () => {
  render(TagInput, { props: { tags: [] } });
  await type("p");
  await vi.advanceTimersByTimeAsync(200);
  expect(suggest.fetch).not.toHaveBeenCalled();

  await type("pe");
  await vi.advanceTimersByTimeAsync(200);
  await waitFor(() => screen.getByRole("listbox"));
  await fireEvent.keyDown(input(), { key: "Escape" });
  expect(screen.queryByRole("listbox")).toBe(null);

  suggest.fetch.mockRejectedValueOnce(new TypeError("offline"));
  await type("pex");
  await vi.advanceTimersByTimeAsync(200);
  expect(screen.queryByRole("listbox")).toBe(null);
});

test("leaving the field commits what was typed", async () => {
  render(TagInput, { props: { tags: [] } });
  await type("rust");
  await fireEvent.blur(input());
  await vi.advanceTimersByTimeAsync(150);
  expect(chips()).toEqual(["Remove tag rust"]);
});

test("refocusing with a draft looks suggestions up again", async () => {
  render(TagInput, { props: { tags: [] } });
  await type("pe");
  await fireEvent.focus(input());
  await waitFor(() => expect(suggest.fetch).toHaveBeenCalledTimes(1));
});
