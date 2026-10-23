// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import AdminUmami from "#lib/components/AdminUmami.svelte";
import { apiError, fakeFetch } from "../../fakeFetch";

const ID = "94db1cb1-74f4-4a40-ad6c-962362670409";

test("accepts a Cloud snippet, saves only after confirmation, and displays its normalized ID", async () => {
  const f = fakeFetch({ "PUT /api/admin/umami": { enabled: true, websiteId: ID } });
  vi.stubGlobal("fetch", f.fetch);
  render(AdminUmami, { props: { initial: { enabled: false, websiteId: "" } } });
  const code = `<script defer src="https://cloud.umami.is/script.js" data-website-id="${ID}"></script>`;
  await fireEvent.input(screen.getByLabelText("Website ID or tracking code"), { target: { value: code } });
  await fireEvent.click(screen.getByRole("switch", { name: "Enable Umami Cloud" }));
  expect(f.calls).toEqual([]);
  await fireEvent.click(screen.getByRole("button", { name: "Save Umami settings" }));
  await waitFor(() => screen.getByText("Umami Cloud enabled."));
  expect(f.calls.at(-1)?.body).toEqual({ enabled: true, websiteId: code });
  expect(screen.getByLabelText("Website ID or tracking code")).toHaveValue(ID);
  expect(document.querySelector('script[src="https://cloud.umami.is/script.js"]')).toBeNull();
});

test("disabling keeps the ID and can be saved even without an ID", async () => {
  const f = fakeFetch({ "PUT /api/admin/umami": { enabled: false, websiteId: ID } });
  vi.stubGlobal("fetch", f.fetch);
  render(AdminUmami, { props: { initial: { enabled: true, websiteId: ID } } });
  await fireEvent.click(screen.getByRole("switch"));
  await fireEvent.click(screen.getByRole("button", { name: "Save Umami settings" }));
  await waitFor(() => screen.getByText("Umami Cloud disabled."));
  expect(f.calls.at(-1)?.body).toEqual({ enabled: false, websiteId: ID });
});

test("a save failure retains the draft and shows the validation error", async () => {
  vi.stubGlobal(
    "fetch",
    fakeFetch({ "PUT /api/admin/umami": apiError(400, "Enter a valid Umami website ID or tracking code.") }).fetch,
  );
  render(AdminUmami, { props: { initial: { enabled: true, websiteId: ID } } });
  await fireEvent.input(screen.getByLabelText("Website ID or tracking code"), { target: { value: "invalid" } });
  await fireEvent.click(screen.getByRole("button", { name: "Save Umami settings" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid Umami website ID or tracking code."),
  );
  expect(screen.getByLabelText("Website ID or tracking code")).toHaveValue("invalid");
  expect(screen.queryByRole("status")).toBeNull();
});

test("the saved website ID can be cleared while disabled", async () => {
  const f = fakeFetch({ "PUT /api/admin/umami": { enabled: false, websiteId: "" } });
  vi.stubGlobal("fetch", f.fetch);
  render(AdminUmami, { props: { initial: { enabled: false, websiteId: ID } } });
  await fireEvent.input(screen.getByLabelText("Website ID or tracking code"), { target: { value: "" } });
  await fireEvent.click(screen.getByRole("button", { name: "Save Umami settings" }));
  await waitFor(() => screen.getByText("Umami Cloud disabled."));
  expect(f.calls.at(-1)?.body).toEqual({ enabled: false, websiteId: "" });
});

test("a failed load cannot overwrite existing settings", async () => {
  vi.stubGlobal("fetch", fakeFetch({ "GET /api/admin/umami": apiError(503, "Unavailable") }).fetch);
  render(AdminUmami);
  await waitFor(() => screen.getByRole("alert"));
  expect(screen.getByRole("button", { name: "Save Umami settings" })).toBeDisabled();
  expect(screen.getByRole("switch")).toBeDisabled();
});

test("without server data, loads the current configuration", async () => {
  vi.stubGlobal("fetch", fakeFetch({ "GET /api/admin/umami": { enabled: false, websiteId: ID } }).fetch);
  render(AdminUmami);
  await waitFor(() => expect(screen.getByLabelText("Website ID or tracking code")).toHaveValue(ID));
  expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
});
