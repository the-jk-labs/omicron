import { confirm, confirmRequest } from "$lib/components/ui/confirm";
import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import { expect, test } from "vitest";

test("opens for a request and resolves ok when confirmed", async () => {
  render(ConfirmDialog);
  const answer = confirm({ title: "Delete post?", description: "This can't be undone.", confirmText: "Delete" });
  await waitFor(() => screen.getByRole("alertdialog"));
  expect(screen.getByText("Delete post?")).toBeInTheDocument();
  expect(screen.getByText("This can't be undone.")).toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(await answer).toEqual({ ok: true, notify: false });
  expect(get(confirmRequest)).toBe(null);
});

test("cancel resolves not ok", async () => {
  render(ConfirmDialog);
  const answer = confirm({ description: "Sure?" });
  await waitFor(() => screen.getByRole("alertdialog"));
  expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(await answer).toEqual({ ok: false, notify: false });
});

test("Escape dismisses as a cancel", async () => {
  render(ConfirmDialog);
  const answer = confirm({ description: "Sure?" });
  await waitFor(() => screen.getByRole("alertdialog"));
  await fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  expect(await answer).toEqual({ ok: false, notify: false });
});

test("the notify checkbox defaults on, honours its initial value, and is reported", async () => {
  render(ConfirmDialog);
  const first = confirm({ description: "Suspend?", notify: { label: "Email them" } });
  await waitFor(() => screen.getByRole("checkbox"));
  expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  await fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(await first).toEqual({ ok: true, notify: true });

  const second = confirm({ description: "Suspend?", notify: { label: "Email them", checked: false } });
  await waitFor(() => expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "false"));
  await fireEvent.click(screen.getByRole("checkbox"));
  await fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(await second).toEqual({ ok: true, notify: true });
});
