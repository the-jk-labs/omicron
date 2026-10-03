// SPDX-License-Identifier: AGPL-3.0-or-later
import { render } from "@testing-library/svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import Time from "#lib/components/Time.svelte";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

// The $app/state stand-in renders in UTC, en-US.
const time = (props: Record<string, unknown>) =>
  render(Time, { props: { iso: "2026-06-01T09:05:00Z", ...props } }).container.querySelector("time")!;

test("a machine-readable datetime with a localized absolute tooltip", () => {
  const el = time({});
  expect(el).toHaveAttribute("datetime", "2026-06-01T09:05:00Z");
  expect(el).toHaveTextContent("Jun 1, 2026, 09:05");
  expect(el.title).toMatch(/^Jun 1, 2026, 09:05 GMT/);
});

test("date-only and time-only kinds", () => {
  expect(time({ kind: "date" })).toHaveTextContent("Jun 1, 2026");
  expect(time({ kind: "time" })).toHaveTextContent("09:05");
});

test("relative within 30 days, absolute beyond", () => {
  expect(time({ relative: true })).toHaveTextContent("2 weeks ago");
  expect(time({ relative: true, kind: "date", iso: "2026-01-01T00:00:00Z" })).toHaveTextContent("Jan 1, 2026");
});

test("the zone can be shown inline", () => {
  expect(time({ kind: "time", withZone: true }).textContent).toMatch(/^09:05 GMT/);
});
