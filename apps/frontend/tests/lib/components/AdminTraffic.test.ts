import { replaceState } from "$app/navigation";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import AdminTraffic from "#lib/components/AdminTraffic.svelte";
import { presetRange } from "#lib/traffic.js";
import { fakeFetch, apiError } from "../../fakeFetch";
import { trafficSummary } from "./trafficFixture";

async function chooseRange(name: string) {
  await fireEvent.keyDown(screen.getByRole("button", { name: "Traffic date range" }), { key: "Enter" });
  const option = await screen.findByRole("option", { name });
  await fireEvent.pointerDown(option, { pointerType: "mouse", button: 0 });
  await fireEvent.pointerUp(option, { pointerType: "mouse", button: 0 });
}

test("date changes load the selected range, persist it in the URL, and ignore late stale replies", async () => {
  const first = Promise.withResolvers<Response>();
  const second = Promise.withResolvers<Response>();
  let calls = 0;
  const f = fakeFetch({ "GET /api/admin/traffic": () => (++calls === 1 ? first.promise : second.promise) });
  vi.stubGlobal("fetch", f.fetch);
  render(AdminTraffic, { props: { initial: trafficSummary() } });
  await chooseRange("Last 7 days");
  await waitFor(() => expect(f.calls).toHaveLength(1));
  expect(f.calls[0].path).toContain(`from=${presetRange("7d").from}`);
  await chooseRange("Last 30 days");
  await waitFor(() => expect(f.calls).toHaveLength(2));
  const result = trafficSummary();
  second.resolve(Response.json({ ...result, totals: { pageviews: 333 } }));
  await waitFor(() => expect(screen.getByText("333", { selector: "p" })).toBeInTheDocument());
  first.resolve(Response.json({ ...result, totals: { pageviews: 777 } }));
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  expect(screen.getByText("333", { selector: "p" })).toBeInTheDocument();
  expect(screen.queryByText("777", { selector: "p" })).toBeNull();
  expect(replaceState).toHaveBeenLastCalledWith(expect.any(URL), {});
});

test("server-loaded metrics render without a duplicate request and explain their limits", () => {
  const f = fakeFetch();
  vi.stubGlobal("fetch", f.fetch);
  render(AdminTraffic, { props: { initial: trafficSummary() } });
  expect(screen.getByRole("heading", { name: "Site traffic" })).toBeInTheDocument();
  expect(screen.getByText("200")).toBeInTheDocument();
  expect(screen.getByText("+100.0%")).toBeInTheDocument();
  expect(screen.getByText(/Cookieless pageview counts/)).toBeInTheDocument();
  expect(screen.getByText(/unique visitors and visits are not measured/)).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /Unique visitors|Visits/ })).toBeNull();
  expect(screen.getByText(/Country lookup is not configured/)).toBeInTheDocument();
  expect(f.calls).toHaveLength(0);
});
test("a failed initial load is visible and can be retried", async () => {
  const f = fakeFetch({ "GET /api/admin/traffic": apiError(503, "Temporarily unavailable") });
  vi.stubGlobal("fetch", f.fetch);
  render(AdminTraffic);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Temporarily unavailable"));
  expect(f.calls).toHaveLength(1);
  await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(f.calls).toHaveLength(2));
});
test("a failed save keeps collection in its previous state", async () => {
  const f = fakeFetch({ "PUT /api/admin/traffic/settings": apiError(500, "Could not save") });
  vi.stubGlobal("fetch", f.fetch);
  render(AdminTraffic, { props: { initial: trafficSummary({ enabled: false }) } });
  const toggle = screen.getByRole("switch");
  await fireEvent.click(toggle);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not save"));
  expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(f.calls[0].body).toEqual({ enabled: true });
});
test("a successful save updates the toggle without losing historical data", async () => {
  vi.stubGlobal("fetch", fakeFetch({ "PUT /api/admin/traffic/settings": { enabled: true } }).fetch);
  render(AdminTraffic, { props: { initial: trafficSummary({ enabled: false }) } });
  await fireEvent.click(screen.getByRole("switch"));
  await waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true"));
  expect(screen.getByText("200")).toBeInTheDocument();
});
test("charts offer exact values in keyboard-accessible data tables and monthly grouping", async () => {
  render(AdminTraffic, { props: { initial: trafficSummary() } });
  await fireEvent.click(screen.getAllByRole("button", { name: "Show data table" })[0]);
  expect(screen.getByRole("table", { name: "Pageviews over time" })).toHaveTextContent("80");
  await fireEvent.click(screen.getByRole("button", { name: "Group by: Day" }));
  expect(screen.getByRole("button", { name: "Group by: Month" })).toBeInTheDocument();
  expect(screen.getByRole("table", { name: "Pageviews over time" })).toHaveTextContent("200");
});
test("geography renders a local map when country aggregates exist", async () => {
  const summary = trafficSummary({ geographyAvailable: true });
  summary.breakdowns.country = [{ value: "US", pageviews: 200 }];
  render(AdminTraffic, { props: { initial: summary } });
  expect(await screen.findByRole("img", { name: /World map/ })).toBeInTheDocument();
  expect(screen.getByText("United States")).toBeInTheDocument();
});
