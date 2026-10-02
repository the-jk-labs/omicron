import AdminUnsplash from "$lib/components/AdminUnsplash.svelte";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import { apiError, fakeFetch } from "../../fakeFetch";

function setup(configured: boolean, routes: Parameters<typeof fakeFetch>[0] = {}) {
  const f = fakeFetch({ "GET /api/admin/unsplash": { configured }, ...routes });
  vi.stubGlobal("fetch", f.fetch);
  render(AdminUnsplash);
  return f;
}

test("saving a key turns Unsplash on and clears the field (the key is never read back)", async () => {
  const { calls } = setup(false, { "PUT /api/admin/unsplash": { configured: true } });
  const input = await waitFor(() => screen.getByPlaceholderText("Your Unsplash Access Key"));
  await fireEvent.input(input, { target: { value: "  key-123 " } });
  await fireEvent.click(screen.getByRole("button", { name: "Save key" }));
  await waitFor(() => screen.getByText("Unsplash added to the banner picker."));
  expect(calls.at(-1)?.body).toEqual({ accessKey: "key-123" });
  expect(screen.getByPlaceholderText("Enter a new key to replace the current one")).toHaveValue("");
});

test("removing the key keeps Openverse", async () => {
  const { calls } = setup(true, { "PUT /api/admin/unsplash": { configured: false } });
  await waitFor(() => screen.getByRole("button", { name: "Remove key" }));
  await fireEvent.click(screen.getByRole("button", { name: "Remove key" }));
  await waitFor(() => screen.getByText("Unsplash removed. Openverse is still available."));
  expect(calls.at(-1)?.body).toEqual({ accessKey: null });
});

test("a load failure is shown", async () => {
  setup(false, { "GET /api/admin/unsplash": apiError(403, "Admins only") });
  await waitFor(() => screen.getByText("Admins only"));
});
