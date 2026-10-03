// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import SaveStatus from "#lib/components/SaveStatus.svelte";

const NOW = new Date("2026-06-15T12:00:00Z").getTime();
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

test("nothing is shown before the first save", () => {
  const { container } = render(SaveStatus, { props: { status: "idle", savedAt: null } });
  expect(container.textContent?.trim()).toBe("");
});

test("saving and failure states", async () => {
  const { rerender } = render(SaveStatus, { props: { status: "saving", savedAt: null } });
  expect(screen.getByText("Saving…")).toBeInTheDocument();
  await rerender({ status: "error", savedAt: null, error: "Offline" });
  expect(screen.getByText("Couldn't save")).toHaveAttribute("title", "Offline");
});

test.for<[number, string]>([
  [10_000, "Saved now"],
  [5 * 60_000, "Saved 5 minutes ago"],
  [3 * 3_600_000, "Saved 3 hours ago"],
  [30 * 3_600_000, "Saved 06:00"],
])("saved %i ms ago reads %s", ([age, label]) => {
  render(SaveStatus, { props: { status: "saved", savedAt: NOW - age } });
  expect(screen.getByRole("paragraph")).toHaveTextContent(label);
});

test("the label ages on its own", async () => {
  render(SaveStatus, { props: { status: "saved", savedAt: NOW } });
  expect(screen.getByRole("paragraph")).toHaveTextContent("Saved now");
  await vi.advanceTimersByTimeAsync(2 * 60_000);
  expect(screen.getByRole("paragraph")).toHaveTextContent("Saved 2 minutes ago");
});
