import AdminSecurity from "$lib/components/AdminSecurity.svelte";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import { apiError, fakeFetch } from "../../fakeFetch";

function setup(
  state: { anubisProtection: boolean; anubisManaged: boolean },
  routes: Parameters<typeof fakeFetch>[0] = {},
) {
  const f = fakeFetch({ "GET /api/admin/security": state, ...routes });
  vi.stubGlobal("fetch", f.fetch);
  render(AdminSecurity);
  return f;
}

const toggle = () => screen.getByRole("switch");

test("reflects the live setting and toggles it", async () => {
  const { calls } = setup(
    { anubisProtection: false, anubisManaged: true },
    { "PUT /api/admin/security/anubis": { anubisProtection: true, anubisManaged: true } },
  );
  await waitFor(() => expect(toggle()).not.toBeDisabled());
  expect(toggle()).toHaveAttribute("aria-checked", "false");
  await fireEvent.click(toggle());
  await waitFor(() => expect(toggle()).toHaveAttribute("aria-checked", "true"));
  expect(calls.at(-1)?.body).toEqual({ anubisProtection: true });
});

test("a failed save puts the switch back and says why", async () => {
  setup(
    { anubisProtection: true, anubisManaged: true },
    { "PUT /api/admin/security/anubis": apiError(502, "Caddy didn't answer") },
  );
  await waitFor(() => expect(toggle()).not.toBeDisabled());
  await fireEvent.click(toggle());
  await waitFor(() => screen.getByText("Caddy didn't answer"));
  expect(toggle()).toHaveAttribute("aria-checked", "true");
});

test("an unmanaged deployment can't be toggled from here", async () => {
  setup({ anubisProtection: false, anubisManaged: false });
  await waitFor(() => expect(screen.queryByText("Loading…")).toBe(null));
  expect(toggle()).toBeDisabled();
});
