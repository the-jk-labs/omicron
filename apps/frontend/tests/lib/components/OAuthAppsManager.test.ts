// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import { beforeEach, expect, test, vi } from "vitest";
import { confirmRequest } from "#lib/components/ui/confirm.js";
import Manager from "../../../src/lib/components/OAuthAppsManager.svelte";
import { apiError, fakeFetch } from "../../fakeFetch";

const existing = {
  id: "client-1",
  name: "Community site",
  website: null,
  redirectUris: ["https://app.example/cb"],
  scopes: ["read:accounts"],
  publicClient: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};
const availableScopes = [
  { scope: "read:accounts", description: "Verify identity" },
  { scope: "webhooks:posts", description: "Post events" },
];
const list = (apps: unknown[] = [existing]) => ({ apps, availableScopes });

function mount(routes: Parameters<typeof fakeFetch>[0]) {
  const { fetch, calls } = fakeFetch(routes);
  vi.stubGlobal("fetch", fetch);
  render(Manager);
  return calls;
}

async function fillForm() {
  await fireEvent.click(await screen.findByRole("button", { name: "New application" }));
  await fireEvent.input(screen.getByLabelText("Name"), { target: { value: "New app" } });
  await fireEvent.input(screen.getByLabelText("Callback URLs, one per line"), {
    target: { value: "https://new.example/cb" },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

test("lists this account's applications with their client ID", async () => {
  mount({ "GET /api/oauth/apps": list() });
  expect(await screen.findByText("Community site")).toBeVisible();
  expect(screen.getByText("client-1")).toBeVisible();
  expect(screen.getByText(/Confidential/)).toBeVisible();
  expect(screen.getByText("https://app.example/cb")).toBeVisible();
  expect(screen.getByText("read:accounts")).toBeVisible();
  expect(screen.getByRole("button", { name: "Copy client ID of Community site" })).toBeVisible();
});

test("says so when there are none", async () => {
  mount({ "GET /api/oauth/apps": list([]) });
  expect(await screen.findByText("No applications yet.")).toBeVisible();
});

test("a failed list is reported", async () => {
  mount({ "GET /api/oauth/apps": apiError(500) });
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your applications.");
});

test("creates an application and shows its secret once", async () => {
  const calls = mount({
    "GET /api/oauth/apps": list([]),
    "POST /api/oauth/apps": {
      app: { ...existing, id: "client-2", name: "New app" },
      clientSecret: "the-secret",
    },
  });
  await fillForm();
  await fireEvent.click(screen.getByRole("checkbox", { name: /webhooks:posts/ }));
  await fireEvent.click(screen.getByRole("button", { name: "Create application" }));

  expect(await screen.findByText("the-secret")).toBeVisible();
  expect(calls.at(-1)?.body).toEqual({
    client_name: "New app",
    redirect_uris: "https://new.example/cb",
    scopes: "read:accounts webhooks:posts",
    token_endpoint_auth_method: "client_secret_basic",
  });

  await fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.queryByText("the-secret")).toBeNull();
  expect(screen.getByText("New app")).toBeVisible();
});

test("a public client is registered as one, with no secret shown", async () => {
  const calls = mount({
    "GET /api/oauth/apps": list([]),
    "POST /api/oauth/apps": { app: { ...existing, publicClient: true }, clientSecret: null },
  });
  await fillForm();
  await fireEvent.click(screen.getByRole("checkbox", { name: /Public client/ }));
  await fireEvent.click(screen.getByRole("button", { name: "Create application" }));

  await waitFor(() => expect(calls.at(-1)?.method).toBe("POST"));
  expect(calls.at(-1)?.body).toMatchObject({ token_endpoint_auth_method: "none" });
  expect(screen.queryByText(/Copy the secret/)).toBeNull();
});

test("shows why the server refused, and keeps what was typed", async () => {
  mount({
    "GET /api/oauth/apps": list([]),
    "POST /api/oauth/apps": Response.json(
      { error: "invalid_request", error_description: "An account can have at most 10 applications." },
      { status: 409 },
    ),
  });
  await fillForm();
  await fireEvent.click(screen.getByRole("button", { name: "Create application" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("An account can have at most 10 applications.");
  expect(screen.getByLabelText("Name")).toHaveValue("New app");
});

test("edits an application without offering to change its client type", async () => {
  const calls = mount({
    "GET /api/oauth/apps": list(),
    "PATCH /api/oauth/apps/client-1": { app: { ...existing, name: "Renamed" } },
  });
  await fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  expect(screen.getByLabelText("Name")).toHaveValue("Community site");
  expect(screen.queryByRole("checkbox", { name: /Public client/ })).toBeNull();

  await fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Renamed" } });
  await fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Renamed")).toBeVisible();
  expect(calls.at(-1)?.body).toMatchObject({ client_name: "Renamed" });
});

test("a new secret is confirmed first, and shown once", async () => {
  const calls = mount({
    "GET /api/oauth/apps": list(),
    "POST /api/oauth/apps/client-1/secret": { clientSecret: "rotated" },
  });
  await fireEvent.click(await screen.findByRole("button", { name: "New secret" }));
  await waitFor(() => expect(get(confirmRequest)).toBeTruthy());
  expect(calls).toHaveLength(1);
  get(confirmRequest)!.resolve({ ok: true, notify: false });
  expect(await screen.findByText("rotated")).toBeVisible();
});

test("a public client isn't offered a new secret", async () => {
  mount({ "GET /api/oauth/apps": list([{ ...existing, publicClient: true }]) });
  await screen.findByText("Community site");
  expect(screen.queryByRole("button", { name: "New secret" })).toBeNull();
});

test("deleting warns that people get disconnected, and backing out does nothing", async () => {
  const calls = mount({
    "GET /api/oauth/apps": list(),
    "DELETE /api/oauth/apps/client-1": { ok: true },
  });
  await fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
  await waitFor(() => expect(get(confirmRequest)?.description).toContain("everyone who approved it is disconnected"));
  get(confirmRequest)!.resolve({ ok: false, notify: false });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(calls).toHaveLength(1);

  await fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(get(confirmRequest)).toBeTruthy());
  get(confirmRequest)!.resolve({ ok: true, notify: false });
  await waitFor(() => expect(screen.queryByText("Community site")).toBeNull());
});
