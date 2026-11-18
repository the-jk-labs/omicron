// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import AdminSecurity from "#lib/components/AdminSecurity.svelte";
import { apiError, fakeFetch } from "../../fakeFetch";

function setup(
  state: { anubisProtection: boolean; anubisManaged: boolean; staffTwoFactorRequired?: boolean },
  routes: Parameters<typeof fakeFetch>[0] = {},
) {
  const f = fakeFetch({
    "GET /api/admin/security": { staffTwoFactorRequired: true, ...state },
    "GET /api/admin/security/access-rules": { rules: [] },
    ...routes,
  });
  vi.stubGlobal("fetch", f.fetch);
  render(AdminSecurity);
  return f;
}

const toggle = () => screen.getByRole("switch", { name: "AI-scraper protection" });
const staffToggle = () => screen.getByRole("switch", { name: "Require two-factor for moderators and admins" });

test("staff two-factor is required by default, and an admin can make it optional", async () => {
  const { calls } = setup(
    { anubisProtection: false, anubisManaged: true },
    {
      "PUT /api/admin/security/staff-two-factor": {
        anubisProtection: false,
        anubisManaged: true,
        staffTwoFactorRequired: false,
      },
    },
  );
  await waitFor(() => expect(staffToggle()).not.toBeDisabled());
  expect(staffToggle()).toHaveAttribute("aria-checked", "true");
  expect(screen.getByText("Required")).toBeInTheDocument();
  await fireEvent.click(staffToggle());
  await waitFor(() => expect(staffToggle()).toHaveAttribute("aria-checked", "false"));
  expect(calls.at(-1)?.body).toEqual({ required: false });
});

test("a refused staff two-factor change puts the switch back and says why", async () => {
  setup(
    { anubisProtection: false, anubisManaged: true },
    { "PUT /api/admin/security/staff-two-factor": apiError(403, "Set up two-factor authentication first.") },
  );
  await waitFor(() => expect(staffToggle()).not.toBeDisabled());
  await fireEvent.click(staffToggle());
  await screen.findByText("Set up two-factor authentication first.");
  expect(staffToggle()).toHaveAttribute("aria-checked", "true");
});

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

test("aligns the protection icon, description and compact switch in a grid", async () => {
  setup({ anubisProtection: true, anubisManaged: true });
  await waitFor(() => expect(toggle()).not.toBeDisabled());

  const card = toggle().parentElement;
  expect(card).toHaveClass("grid", "items-start");
  expect(card).toHaveClass("sm:grid-cols-[2.75rem_minmax(0,1fr)_auto]");
  expect(toggle()).toHaveClass("h-[28px]", "w-[48px]", "mt-0.5");
  expect(screen.getByText("Enabled · Anubis")).toHaveClass("rounded-full");
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
