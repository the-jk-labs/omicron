import ListFormDialog from "$lib/components/ListFormDialog.svelte";
import type { ReadingList } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { expect, test, vi } from "vitest";
import { apiError, fakeFetch } from "../../fakeFetch";

// The page passes its own trigger; bits-ui hands it the props (handlers,
// aria) it must spread, which a raw snippet does by hand.
const trigger = createRawSnippet((props: () => Record<string, unknown>) => ({
  render: () => "<button>Open list form</button>",
  setup: (el: Element) => {
    for (const [key, value] of Object.entries(props())) {
      if (typeof value === "function" && key.startsWith("on"))
        el.addEventListener(key.slice(2), value as EventListener);
      else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
        el.setAttribute(key, String(value));
    }
  },
}));

function setup(list?: Partial<ReadingList>, routes: Parameters<typeof fakeFetch>[0] = {}) {
  const f = fakeFetch(routes);
  vi.stubGlobal("fetch", f.fetch);
  const onSaved = vi.fn<(l: ReadingList) => void>();
  render(ListFormDialog, { props: { list: list as ReadingList | undefined, onSaved, children: trigger } });
  return { ...f, onSaved };
}

async function openDialog() {
  await fireEvent.click(screen.getByRole("button", { name: "Open list form" }));
  await waitFor(() => screen.getByRole("dialog"));
}

const submit = () => fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);

test("creating needs a title", async () => {
  const { calls } = setup();
  await openDialog();
  expect(screen.getByText("New list")).toBeInTheDocument();
  await submit();
  expect(screen.getByText("A list needs a title.")).toBeInTheDocument();
  expect(calls).toEqual([]);
});

test("creates a trimmed, public list by default and closes", async () => {
  const created = { id: "l1", title: "Reads" };
  const { calls, onSaved } = setup(undefined, { "POST /api/lists": { list: created } });
  await openDialog();
  await fireEvent.input(screen.getByLabelText(/Title/i), { target: { value: "  Reads  " } });
  await fireEvent.input(screen.getByLabelText(/Description/i), { target: { value: " About " } });
  await submit();
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(created));
  expect(calls[0].body).toEqual({ title: "Reads", description: "About", visibility: "public" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null));
});

test("editing starts from the list and can make it private", async () => {
  const { calls } = setup(
    { id: "l1", title: "Reads", description: "d", visibility: "public" },
    { "PATCH /api/lists/l1": { list: { id: "l1" } } },
  );
  await openDialog();
  expect(screen.getByText("Edit list")).toBeInTheDocument();
  expect(screen.getByLabelText(/Title/i)).toHaveValue("Reads");
  await fireEvent.click(screen.getByRole("switch"));
  await submit();
  await waitFor(() => expect(calls[0]?.body).toEqual({ title: "Reads", description: "d", visibility: "private" }));
});

test("the read-later list has no title to edit, and never sends one", async () => {
  const { calls } = setup(
    { id: "rl", title: "Read later", isReadLater: true, visibility: "private", description: "" },
    { "PATCH /api/lists/rl": { list: { id: "rl" } } },
  );
  await openDialog();
  expect(screen.queryByLabelText(/Title/i)).toBe(null);
  await submit();
  await waitFor(() => expect(calls[0]?.body).toEqual({ description: "", visibility: "private" }));
});

test("a server error is shown and the dialog stays open", async () => {
  setup(undefined, { "POST /api/lists": apiError(400, "Too many lists") });
  await openDialog();
  await fireEvent.input(screen.getByLabelText(/Title/i), { target: { value: "x" } });
  await submit();
  await waitFor(() => screen.getByText("Too many lists"));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
