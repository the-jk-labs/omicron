// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
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

async function openAdd() {
  const trigger = screen.getByRole("button", { name: "Add rule" });
  await waitFor(() => expect(trigger).toBeEnabled());
  trigger.focus();
  await fireEvent.click(trigger);
  return screen.findByRole("dialog", { name: "Add IP rule" });
}

async function openTester() {
  const trigger = screen.getByRole("button", { name: "Test rules" });
  await waitFor(() => expect(trigger).toBeEnabled());
  trigger.focus();
  await fireEvent.click(trigger);
  return screen.findByRole("dialog", { name: "Test saved rules" });
}

async function choose(label: string, value: string) {
  await fireEvent.keyDown(screen.getByLabelText(label), { key: "Enter" });
  const option = await screen.findByRole("option", { name: value });
  await fireEvent.pointerDown(option, { pointerType: "mouse", button: 0 });
  await fireEvent.pointerUp(option, { pointerType: "mouse", button: 0 });
}

async function openActions() {
  const trigger = screen.getByRole("button", { name: "Actions for 192.0.2.0/24" });
  await waitFor(() => expect(trigger).toBeEnabled());
  await fireEvent.keyDown(trigger, { key: "Enter" });
  return screen.findByRole("menu");
}

test("starts compact, keeping creation and testing out of the rules overview", async () => {
  setup();
  await screen.findByText("No custom IP rules.");
  expect(screen.getByText("0 active")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("IP address or CIDR range")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Visitor IP address")).not.toBeInTheDocument();
  expect(screen.getByText(/do not use behind a CDN/)).toBeInTheDocument();
});

test("adds a temporary rule from the dialog, then returns to the updated list", async () => {
  const { calls } = setup([], { "POST /api/admin/security/access-rules": { rules: [rule] } });
  const dialog = await openAdd();
  await waitFor(() => expect(within(dialog).getByLabelText("IP address or CIDR range")).toHaveFocus());
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
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText(rule.network)).toBeInTheDocument();
  expect(screen.getByText("1 active")).toBeInTheDocument();
});

test("cancel creates nothing and reopening resets the form", async () => {
  const { calls } = setup();
  await openAdd();
  await fireEvent.input(screen.getByLabelText("IP address or CIDR range"), { target: { value: "192.0.2.1" } });
  await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole("button", { name: "Add rule" })).toHaveFocus());
  await openAdd();
  expect(screen.getByLabelText("IP address or CIDR range")).toHaveValue("");
  expect(calls.filter((call) => call.method !== "GET")).toHaveLength(0);
});

test("compact selects support an allow exception with a short expiry", async () => {
  const { calls } = setup([], { "POST /api/admin/security/access-rules": { rules: [{ ...rule, action: "allow" }] } });
  await openAdd();
  await fireEvent.input(screen.getByLabelText("IP address or CIDR range"), { target: { value: "192.0.2.1" } });
  await choose("Action", "Allow without challenge");
  await choose("Expires after", "1 hour");
  await fireEvent.click(screen.getByRole("button", { name: "Apply rule" }));
  await screen.findByText("IP rule applied. It expires automatically.");
  expect(calls.at(-1)?.body).toEqual({ network: "192.0.2.1", action: "allow", reason: "", expiresInHours: 1 });
});

test("disables, enables and removes saved rules through the actions menu", async () => {
  const { calls } = setup([rule], {
    "PATCH /api/admin/security/access-rules/r1": async (request) =>
      Response.json({ rules: [{ ...rule, enabled: (await request.json()).enabled }] }),
    "DELETE /api/admin/security/access-rules/r1": { rules: [] },
  });
  await screen.findByText("Suspicious traffic");
  await openActions();
  await fireEvent.click(screen.getByRole("menuitem", { name: "Disable rule" }));
  await screen.findByText("Disabled");
  expect(calls.at(-1)?.body).toEqual({ enabled: false });
  await openActions();
  await fireEvent.click(screen.getByRole("menuitem", { name: "Enable rule" }));
  await screen.findByText("Active");
  expect(calls.at(-1)?.body).toEqual({ enabled: true });
  await openActions();
  await fireEvent.click(screen.getByRole("menuitem", { name: "Remove rule" }));
  await screen.findByText("No custom IP rules.");
});

test("keeps a rejected rule in the open dialog with its input intact", async () => {
  setup([rule], { "POST /api/admin/security/access-rules": apiError(400, "Caddy rejected the config.") });
  await openAdd();
  await fireEvent.input(screen.getByLabelText("IP address or CIDR range"), { target: { value: "198.51.100.1" } });
  await fireEvent.click(screen.getByRole("button", { name: "Apply rule" }));
  const dialog = screen.getByRole("dialog", { name: "Add IP rule" });
  await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("Caddy rejected the config."));
  expect(screen.getByLabelText("IP address or CIDR range")).toHaveValue("198.51.100.1");
  await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await screen.findByText("Suspicious traffic");
});

test("keeps the saving dialog open and prevents duplicate submissions", async () => {
  let finish!: (response: Response) => void;
  const { calls } = setup([], {
    "POST /api/admin/security/access-rules": () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  });
  await openAdd();
  await fireEvent.input(screen.getByLabelText("IP address or CIDR range"), { target: { value: "192.0.2.1" } });
  await fireEvent.click(screen.getByRole("button", { name: "Apply rule" }));
  await waitFor(() => expect(calls.at(-1)?.method).toBe("POST"));
  expect(screen.getByRole("button", { name: "Applying…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  finish(Response.json({ rules: [rule] }));
  await screen.findByText("IP rule applied. It expires automatically.");
  expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
});

test("the separate tester previews saved rules without any write", async () => {
  const { calls } = setup([], {
    "POST /api/admin/security/access-rules/test": {
      action: "exempt",
      ruleId: null,
      message: "Recovery paths stay reachable.",
    },
  });
  await openTester();
  await fireEvent.input(screen.getByLabelText("Visitor IP address"), { target: { value: "192.0.2.1" } });
  await fireEvent.input(screen.getByLabelText("URL path"), { target: { value: "/admin" } });
  await fireEvent.click(screen.getByRole("button", { name: "Test saved rules" }));
  await screen.findByText("Exempt path");
  expect(calls.at(-1)?.body).toEqual({ ip: "192.0.2.1", path: "/admin" });
  expect(calls.filter((call) => call.method !== "GET")).toHaveLength(1);
});

test("draft testing is optional and cannot submit the creation form", async () => {
  const { calls } = setup([], {
    "POST /api/admin/security/access-rules/test": {
      action: "block",
      ruleId: "draft",
      message: "This IP would receive HTTP 403 on this path.",
    },
  });
  await openAdd();
  await fireEvent.input(screen.getByLabelText("IP address or CIDR range"), { target: { value: "192.0.2.0/24" } });
  expect(screen.getByLabelText("Visitor IP address")).not.toBeVisible();
  await fireEvent.click(screen.getByRole("button", { name: "Preview this rule" }));
  const ip = await screen.findByLabelText("Visitor IP address");
  await fireEvent.input(ip, { target: { value: "192.0.2.1" } });
  await fireEvent.click(screen.getByRole("button", { name: "Test draft rule" }));
  await screen.findByText("Would block");
  expect(calls.at(-1)?.body).toEqual({
    ip: "192.0.2.1",
    path: "/search",
    draft: { network: "192.0.2.0/24", action: "block" },
  });
  expect(ip.closest("form")?.id).not.toBe("access-rule-form");
  expect(screen.getByRole("button", { name: "Apply rule" })).toHaveAttribute("form", "access-rule-form");
  expect(calls.filter((call) => call.method !== "GET")).toHaveLength(1);
  await fireEvent.input(screen.getByLabelText("URL path"), { target: { value: "/admin" } });
  await waitFor(() => expect(screen.queryByText("Would block")).not.toBeInTheDocument());
});

test("discards a late preview response after inputs change", async () => {
  let finish!: (response: Response) => void;
  const { calls } = setup([], {
    "POST /api/admin/security/access-rules/test": () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  });
  await openTester();
  await fireEvent.input(screen.getByLabelText("Visitor IP address"), { target: { value: "192.0.2.1" } });
  await fireEvent.click(screen.getByRole("button", { name: "Test saved rules" }));
  await waitFor(() => expect(calls.at(-1)?.path).toBe("/api/admin/security/access-rules/test"));
  await fireEvent.input(screen.getByLabelText("URL path"), { target: { value: "/admin" } });
  finish(Response.json({ action: "block", ruleId: "r1", message: "Old result" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Test saved rules" })).not.toBeDisabled());
  expect(screen.queryByText("Old result")).not.toBeInTheDocument();
});

test("closing a pending preview does not leak its result into the next dialog", async () => {
  let finish!: (response: Response) => void;
  const { calls } = setup([], {
    "POST /api/admin/security/access-rules/test": () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  });
  await openTester();
  await fireEvent.input(screen.getByLabelText("Visitor IP address"), { target: { value: "192.0.2.1" } });
  await fireEvent.click(screen.getByRole("button", { name: "Test saved rules" }));
  await waitFor(() => expect(calls.at(-1)?.method).toBe("POST"));
  await fireEvent.click(screen.getByRole("button", { name: "Close rule tester" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  finish(Response.json({ action: "block", ruleId: "r1", message: "Old result" }));
  await openTester();
  expect(screen.getByLabelText("Visitor IP address")).toHaveValue("");
  expect(screen.queryByText("Old result")).not.toBeInTheDocument();
});

test("expired rules can be removed but not re-enabled", async () => {
  setup([{ ...rule, enabled: false, expiresAt: "2000-01-01T00:00:00Z" }]);
  await screen.findByText(rule.network);
  expect(screen.getByText("0 active")).toBeInTheDocument();
  await openActions();
  expect(screen.getByRole("menuitem", { name: "Enable rule" })).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("menuitem", { name: "Remove rule" })).not.toHaveAttribute("aria-disabled", "true");
});

test("unmanaged deployments remain read-only but can test saved rules", async () => {
  setup([rule], {}, false);
  await screen.findByText("Suspicious traffic");
  expect(screen.getByRole("button", { name: "Add rule" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Actions for 192.0.2.0/24" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Test rules" })).toBeEnabled();
});

test("load failures do not masquerade as an empty list or permit edits", async () => {
  setup([], { "GET /api/admin/security/access-rules": apiError(503, "Unavailable") });
  await screen.findByRole("button", { name: "Retry loading IP rules" });
  expect(screen.queryByText("No custom IP rules.")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add rule" })).toBeDisabled();
});

test("long explanations are available on demand without hiding the proxy warning", async () => {
  setup();
  await screen.findByText("No custom IP rules.");
  const trigger = screen.getByRole("button", { name: "Scope & safeguards" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  await fireEvent.click(trigger);
  await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "true"));
  expect(screen.getByText(/At most 100 unexpired rules/)).toBeInTheDocument();
});
