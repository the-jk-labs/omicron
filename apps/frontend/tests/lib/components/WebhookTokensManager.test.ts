// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import { expect, test, vi } from "vitest";
import { confirmRequest } from "#lib/components/ui/confirm.js";
import WebhookTokensManager from "#lib/components/WebhookTokensManager.svelte";
import { apiError, fakeFetch } from "../../fakeFetch";

const token = (id: string, label: string) => ({
  id,
  label,
  createdAt: "2026-01-01T00:00:00Z",
  lastUsedAt: null,
});

function setup(routes: Parameters<typeof fakeFetch>[0]) {
  const f = fakeFetch({ "GET /api/webhooks/tokens": { tokens: [token("t1", "CI")] }, ...routes });
  vi.stubGlobal("fetch", f.fetch);
  render(WebhookTokensManager);
  return f;
}

test("issues a token, shows the secret once, and lists it first", async () => {
  const { calls } = setup({ "POST /api/webhooks/tokens": { token: "whk_secret", tokenInfo: token("t2", "Sanity") } });
  await waitFor(() => screen.getByText("CI"));
  const create = screen.getAllByRole("button").find((b) => /create|issue|generate/i.test(b.textContent ?? ""))!;
  expect(create).toBeDisabled();
  await fireEvent.input(screen.getByPlaceholderText(/What is it for/), { target: { value: "  Sanity " } });
  await fireEvent.click(create);
  await waitFor(() => screen.getByText("whk_secret"));
  expect(calls.at(-1)?.body).toEqual({ label: "Sanity" });
  await fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.queryByText("whk_secret")).toBe(null);
});

test("copies the fresh token to the clipboard", async () => {
  const writeText = vi.fn<(s: string) => Promise<void>>(async () => {});
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  setup({ "POST /api/webhooks/tokens": { token: "whk_secret", tokenInfo: token("t2", "S") } });
  await waitFor(() => screen.getByText("CI"));
  await fireEvent.input(screen.getByPlaceholderText(/What is it for/), { target: { value: "S" } });
  await fireEvent.click(screen.getAllByRole("button").find((b) => /create|issue|generate/i.test(b.textContent ?? ""))!);
  await waitFor(() => screen.getByText("whk_secret"));
  await fireEvent.click(screen.getByRole("button", { name: /Copy/ }));
  expect(writeText).toHaveBeenCalledWith("whk_secret");
});

test("revoking asks first; a cancel keeps the token", async () => {
  const { calls } = setup({ "DELETE /api/webhooks/tokens/t1": { ok: true } });
  await waitFor(() => screen.getByText("CI"));
  await fireEvent.click(screen.getByRole("button", { name: /Revoke/ }));
  get(confirmRequest)!.resolve({ ok: false, notify: false });
  await Promise.resolve();
  expect(calls.some((c) => c.method === "DELETE")).toBe(false);

  await fireEvent.click(screen.getByRole("button", { name: /Revoke/ }));
  expect(get(confirmRequest)?.description).toContain("“CI” will stop working immediately");
  get(confirmRequest)!.resolve({ ok: true, notify: false });
  await waitFor(() => expect(screen.queryByText("CI")).toBe(null));
});

test("a load failure is shown", async () => {
  setup({ "GET /api/webhooks/tokens": apiError(500, "Tokens unavailable") });
  await waitFor(() => screen.getByText("Tokens unavailable"));
});

test("a server-loaded list shows straight away, without loading it again", () => {
  const { fetch } = fakeFetch({});
  vi.stubGlobal("fetch", fetch);
  render(WebhookTokensManager, { props: { initial: [token("t1", "CI")] } });
  expect(screen.getByText("CI")).toBeInTheDocument();
  expect(screen.queryByText("Loading…")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
