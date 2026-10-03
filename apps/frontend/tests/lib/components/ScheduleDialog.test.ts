// SPDX-License-Identifier: AGPL-3.0-or-later
// The timezone stand-in renders in UTC, so every time below is UTC.
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ScheduleDialog from "#lib/components/ScheduleDialog.svelte";
import { timeZone } from "#lib/timezone.svelte.js";

vi.mock(import("#lib/timezone.svelte.js"), async (importOriginal) => ({
  ...(await importOriginal()),
  timeZone: { current: "UTC" },
}));

beforeEach(() => {
  // Thursday.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-11T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

function setup(current: string | null = null) {
  const onconfirm = vi.fn<(iso: string) => void>();
  render(ScheduleDialog, { props: { open: true, current, onconfirm } });
  return onconfirm;
}

const confirmButton = (label = "Schedule") => screen.getByRole("button", { name: label });

test("a new schedule defaults to tomorrow 09:00 and confirms that instant", async () => {
  const onconfirm = setup();
  await waitFor(() => screen.getByText("Schedule post"));
  expect(screen.getByText("Friday, June 12, 2026 at 09:00")).toBeInTheDocument();
  await fireEvent.click(confirmButton());
  expect(onconfirm).toHaveBeenCalledWith("2026-06-12T09:00:00.000Z");
});

test("rescheduling starts from the current time", async () => {
  const onconfirm = setup("2026-07-01T15:30:00Z");
  await waitFor(() => screen.getByText("Reschedule post"));
  expect(screen.getByText("Wednesday, July 1, 2026 at 15:30")).toBeInTheDocument();
  await fireEvent.click(confirmButton("Reschedule"));
  expect(onconfirm).toHaveBeenCalledWith("2026-07-01T15:30:00.000Z");
});

test.for([
  ["In an hour", "2026-06-11T13:00:00.000Z"],
  ["Tomorrow, 09:00", "2026-06-12T09:00:00.000Z"],
  ["Next Monday, 09:00", "2026-06-15T09:00:00.000Z"],
])("the %s preset", async ([label, iso]) => {
  const onconfirm = setup();
  await waitFor(() => screen.getByText("Schedule post"));
  await fireEvent.click(screen.getByRole("button", { name: label }));
  await fireEvent.click(confirmButton());
  expect(onconfirm).toHaveBeenCalledWith(iso);
});

// The weekday must be the chosen zone's, not the browser's: in Kiritimati
// (UTC+14) it is already Friday, and a browser in Los Angeles is a day behind.
test("Next Monday is a Monday in the chosen zone, whatever the browser's zone", async () => {
  const tz = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  (timeZone as { current: string }).current = "Pacific/Kiritimati";
  try {
    const onconfirm = setup();
    await waitFor(() => screen.getByText("Schedule post"));
    await fireEvent.click(screen.getByRole("button", { name: "Next Monday, 09:00" }));
    await fireEvent.click(confirmButton());
    expect(onconfirm).toHaveBeenCalledWith("2026-06-14T19:00:00.000Z");
  } finally {
    process.env.TZ = tz;
    (timeZone as { current: string }).current = "UTC";
  }
});

test("a time less than a minute away is refused", async () => {
  const onconfirm = setup("2026-06-11T12:00:30Z");
  await waitFor(() => screen.getByText("Reschedule post"));
  await fireEvent.click(confirmButton("Reschedule"));
  expect(screen.getByText(/at least a minute from now/)).toBeInTheDocument();
  expect(onconfirm).not.toHaveBeenCalled();
});
