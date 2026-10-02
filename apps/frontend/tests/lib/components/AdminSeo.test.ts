import AdminSeo from "$lib/components/AdminSeo.svelte";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import { apiError, fakeFetch } from "../../fakeFetch";

const settings = {
  indexingEnabled: true,
  verification: { google: "g-token" },
  indexNowEnabled: false,
  indexNowKey: null,
};

const tokens = () => screen.getAllByPlaceholderText("Verification token").map((i) => (i as HTMLInputElement).value);

function setup(routes: Parameters<typeof fakeFetch>[0] = {}) {
  const f = fakeFetch({ "GET /api/admin/seo": settings, ...routes });
  vi.stubGlobal("fetch", f.fetch);
  render(AdminSeo);
  return f;
}

test("loads the settings into the form, one verification field per engine", async () => {
  setup();
  await waitFor(() => expect(tokens()).toEqual(["", "g-token", ""]));
});

test("saves indexing, verification tokens and IndexNow together", async () => {
  const { calls } = setup({
    "PUT /api/admin/seo": { ...settings, indexingEnabled: false, indexNowEnabled: true, indexNowKey: "k" },
  });
  await waitFor(() => expect(tokens()).toContain("g-token"));
  await fireEvent.input(screen.getAllByPlaceholderText("Verification token")[0], { target: { value: "bing-token" } });
  const [, indexNow] = screen.getAllByRole("switch");
  await fireEvent.click(indexNow);
  await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => screen.getByText("Saved."));
  expect(calls.at(-1)?.body).toEqual({
    indexingEnabled: true,
    verification: { google: "g-token", bing: "bing-token" },
    indexNowEnabled: true,
  });
});

test("IndexNow can't be switched on while indexing is off", async () => {
  setup();
  await waitFor(() => expect(tokens()).toContain("g-token"));
  const [indexing, indexNow] = screen.getAllByRole("switch");
  expect(indexNow).not.toBeDisabled();
  await fireEvent.click(indexing);
  expect(indexNow).toBeDisabled();
});

test("failures are shown", async () => {
  setup({ "PUT /api/admin/seo": apiError(400, "Invalid token") });
  await waitFor(() => expect(tokens()).toContain("g-token"));
  await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => screen.getByText("Invalid token"));
});
