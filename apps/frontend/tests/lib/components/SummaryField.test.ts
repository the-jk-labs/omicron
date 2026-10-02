import SummaryField from "$lib/components/SummaryField.svelte";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

test("collapsed behind a button when empty; opening focuses the field", async () => {
  render(SummaryField, { props: { summary: "" } });
  expect(screen.queryByRole("textbox")).toBe(null);
  await fireEvent.click(screen.getByRole("button", { name: /Add a description/ }));
  expect(screen.getByRole("textbox")).toHaveFocus();
});

test("open with a counter when there is already a summary; edits notify the page", async () => {
  const onChange = vi.fn<() => void>();
  render(SummaryField, { props: { summary: "Hello", onChange } });
  expect(screen.getByRole("textbox")).toHaveValue("Hello");
  expect(screen.getByText("5/150")).toBeInTheDocument();
  expect(screen.getByRole("textbox")).toHaveAttribute("maxlength", "150");
  await fireEvent.input(screen.getByRole("textbox"), { target: { value: "Hello!" } });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(screen.getByText("6/150")).toBeInTheDocument();
});

test("removing the description clears and collapses it", async () => {
  const onChange = vi.fn<() => void>();
  render(SummaryField, { props: { summary: "Hello", onChange } });
  await fireEvent.click(screen.getByRole("button", { name: "Remove the description" }));
  expect(onChange).toHaveBeenCalled();
  expect(screen.queryByRole("textbox")).toBe(null);
  expect(screen.getByRole("button", { name: /Add a description/ })).toBeInTheDocument();
});
