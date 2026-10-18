// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import AdminAccessRules from "#lib/components/AdminAccessRules.svelte";
import type { AccessRule } from "#lib/types.js";
import { apiError, fakeFetch } from "../../fakeFetch";

const rule: AccessRule = {
  id: "r1",
  network: "192.0.2.0/24",
  action: "block",
  reason: "Suspicious traffic",
  enabled: true,
  createdAt: "2026-10-18T00:00:00Z",
  expiresAt: "2099-10-19T00:00:00Z",
};

function setup(rules: AccessRule[] = [], routes: Parameters<typeof fakeFetch>[0] = {}, managed = true) {
  const f = fakeFetch({ "GET /api/admin/security/access-rules": { rules }, ...routes });
  vi.stubGlobal("fetch", f.fetch);
  render(AdminAccessRules, { managed });
  return f;
}

test("adds a temporary rule with a reason and a safe default expiry", async () => {
  const { calls } = setup([], { "POST /api/admin/security/access-rules": { rules: [rule] } });
  await screen.findByText("No custom IP rules.");
  await fireEvent.input(screen.getByLabelText("IP address or CIDR range"), { target: { value: "192.0.2.0/24" } });
  await fireEvent.input(screen.getByLabelText("Reason (optional)"), { target: { value: "Suspicious traffic" } });
  await fireEvent.click(screen.getByRole("button", { name: "Apply rule" }));
  await screen.findByText("IP rule applied. It expires automatically.");
  expect(calls.at(-1)?.body).toEqual({
    network: "192.0.2.0/24",
    action: "block",
    reason: "Suspicious traffic",
    expiresInHours: 24,
  });
  expect(screen.getByText("Block 192.0.2.0/24")).toBeInTheDocument();
  expect(screen.getByLabelText("IP address or CIDR range")).toHaveValue("");
});

test("disables and removes saved rules", async () => {
  const { calls } = setup([rule], {
    "PATCH /api/admin/security/access-rules/r1": { rules: [{ ...rule, enabled: false }] },
    "DELETE /api/admin/security/access-rules/r1": { rules: [] },
  });
  await screen.findByText("Suspicious traffic");
  await fireEvent.click(screen.getByRole("button", { name: "Disable 192.0.2.0/24" }));
  await screen.findByRole("button", { name: "Enable 192.0.2.0/24" });
  expect(calls.at(-1)?.body).toEqual({ enabled: false });
  await fireEvent.click(screen.getByRole("button", { name: "Remove 192.0.2.0/24" }));
  await screen.findByText("No custom IP rules.");
});

test("supports an allow exception with a short expiry", async () => {
  const { calls } = setup([], { "POST /api/admin/security/access-rules": { rules: [{ ...rule, action: "allow" }] } });
  await screen.findByText("No custom IP rules.");
  await fireEvent.input(screen.getByLabelText("IP address or CIDR range"), { target: { value: "192.0.2.1" } });
  await fireEvent.click(screen.getByRole("radio", { name: "Allow without an Anubis challenge" }));
  await fireEvent.click(screen.getByRole("radio", { name: /^1 hour$/ }));
  await fireEvent.click(screen.getByRole("button", { name: "Apply rule" }));
  await screen.findByText("IP rule applied. It expires automatically.");
  expect(calls.at(-1)?.body).toEqual({ network: "192.0.2.1", action: "allow", reason: "", expiresInHours: 1 });
});

test("discards a late preview response after its inputs change", async () => {
  let finish!: (response: Response) => void;
  const { calls } = setup([], {
    "POST /api/admin/security/access-rules/test": () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  });
  await screen.findByText("No custom IP rules.");
  await fireEvent.input(screen.getByLabelText("Visitor IP address"), { target: { value: "192.0.2.1" } });
  await fireEvent.click(screen.getByRole("button", { name: "Test saved rules" }));
  await waitFor(() => expect(calls.at(-1)?.path).toBe("/api/admin/security/access-rules/test"));
  await fireEvent.input(screen.getByLabelText("URL path"), { target: { value: "/admin" } });
  finish(Response.json({ action: "block", ruleId: "r1", message: "Old result" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Test saved rules" })).not.toBeDisabled());
  expect(screen.queryByText("Old result")).not.toBeInTheDocument();
});

test("tests a draft without saving, and clears stale results after editing", async () => {
  const { calls } = setup([], {
    "POST /api/admin/security/access-rules/test": {
      action: "block",
      ruleId: "draft",
      message: "This IP would receive HTTP 403 on this path.",
    },
  });
  await screen.findByText("No custom IP rules.");
  await fireEvent.input(screen.getByLabelText("IP address or CIDR range"), { target: { value: "192.0.2.0/24" } });
  await fireEvent.input(screen.getByLabelText("Visitor IP address"), { target: { value: "192.0.2.1" } });
  await fireEvent.input(screen.getByLabelText("URL path"), { target: { value: "/search" } });
  await fireEvent.click(screen.getByRole("button", { name: "Test draft rule" }));
  await screen.findByText("Draft: This IP would receive HTTP 403 on this path.");
  expect(calls.at(-1)?.body).toEqual({
    ip: "192.0.2.1",
    path: "/search",
    draft: { network: "192.0.2.0/24", action: "block" },
  });
  expect(calls.filter((call) => call.method !== "GET")).toHaveLength(1);
  await fireEvent.input(screen.getByLabelText("URL path"), { target: { value: "/admin" } });
  await waitFor(() =>
    expect(screen.queryByText("Draft: This IP would receive HTTP 403 on this path.")).not.toBeInTheDocument(),
  );
});

test("keeps a rejected rule's input and existing list intact", async () => {
  setup([rule], { "POST /api/admin/security/access-rules": apiError(400, "Caddy rejected the config.") });
  await screen.findByText("Suspicious traffic");
  await fireEvent.input(screen.getByLabelText("IP address or CIDR range"), { target: { value: "198.51.100.1" } });
  await fireEvent.click(screen.getByRole("button", { name: "Apply rule" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).toHaveTextContent("Caddy rejected the config.");
  expect(screen.getByLabelText("IP address or CIDR range")).toHaveValue("198.51.100.1");
  expect(screen.getByText("Suspicious traffic")).toBeInTheDocument();
});

test("unmanaged deployments are read-only, and expired rules cannot be re-enabled", async () => {
  setup([{ ...rule, expiresAt: "2000-01-01T00:00:00Z" }], {}, false);
  await screen.findByText("Suspicious traffic");
  expect(screen.getByRole("button", { name: "Apply rule" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Disable 192.0.2.0/24" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Remove 192.0.2.0/24" })).toBeDisabled();
});

test("load failures do not masquerade as an empty list", async () => {
  setup([], { "GET /api/admin/security/access-rules": apiError(503, "Unavailable") });
  await screen.findByRole("button", { name: "Retry loading IP rules" });
  expect(screen.queryByText("No custom IP rules.")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Apply rule" })).not.toBeInTheDocument();
});
