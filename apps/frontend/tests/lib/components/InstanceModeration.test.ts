import InstanceModeration from "$lib/components/InstanceModeration.svelte";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import { apiError, fakeFetch } from "../../fakeFetch";

test("toggles on-instance view counting", async () => {
  const { fetch, calls } = fakeFetch({
    "GET /api/admin/settings": { onInstanceViews: false },
    "PUT /api/admin/settings/analytics": { onInstanceViews: true },
  });
  vi.stubGlobal("fetch", fetch);
  render(InstanceModeration);
  const toggle = screen.getByRole("switch");
  await waitFor(() => expect(toggle).not.toBeDisabled());
  await fireEvent.click(toggle);
  await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
  expect(calls.at(-1)?.body).toEqual({ onInstanceViews: true });
});

test("a failed save reverts and explains", async () => {
  vi.stubGlobal(
    "fetch",
    fakeFetch({
      "GET /api/admin/settings": { onInstanceViews: true },
      "PUT /api/admin/settings/analytics": apiError(403, "Admins only"),
    }).fetch,
  );
  render(InstanceModeration);
  const toggle = screen.getByRole("switch");
  await waitFor(() => expect(toggle).not.toBeDisabled());
  await fireEvent.click(toggle);
  await waitFor(() => screen.getByText("Admins only"));
  expect(toggle).toHaveAttribute("aria-checked", "true");
});
