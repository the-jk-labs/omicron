// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import Manager from "../../../src/lib/components/IdentityConnectionsManager.svelte";
import { fakeFetch } from "../../fakeFetch";

const connection = {
  id: "owned-id",
  name: "Directory",
  callbackOrigin: "https://client.example",
  createdAt: "2026-01-01T00:00:00Z",
  expiresAt: "2026-01-01T01:00:00Z",
};
test("lists connections and revokes them immediately", async () => {
  const { fetch, calls } = fakeFetch({
    "GET /api/oauth/connections": { connections: [connection] },
    "DELETE /api/oauth/connections/owned-id": { ok: true },
  });
  vi.stubGlobal("fetch", fetch);
  render(Manager);
  await screen.findByText("Directory");
  await fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
  await screen.findByText("No connected applications.");
  expect(calls[1].method).toBe("DELETE");
});
test("a failed revoke keeps the connection visible and reports the failure", async () => {
  const { fetch } = fakeFetch({
    "GET /api/oauth/connections": { connections: [connection] },
    "DELETE /api/oauth/connections/owned-id": new Response("Unavailable", { status: 503 }),
  });
  vi.stubGlobal("fetch", fetch);
  render(Manager);
  await screen.findByText("Directory");
  await fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not revoke access."));
  expect(screen.getByText("Directory")).toBeVisible();
});
test("a failed list is not misrepresented as no connected applications", async () => {
  const { fetch } = fakeFetch({ "GET /api/oauth/connections": new Response("Unavailable", { status: 503 }) });
  vi.stubGlobal("fetch", fetch);
  render(Manager);
  await screen.findByRole("alert");
  expect(screen.queryByText("No connected applications.")).toBeNull();
});
