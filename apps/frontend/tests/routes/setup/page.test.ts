import { goto, invalidateAll } from "$app/navigation";
import { page } from "$app/state";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import SetupPage from "../../../src/routes/setup/+page.svelte";
import { apiError, fakeFetch } from "../../fakeFetch";

afterEach(() => {
  Object.assign(page.data, { instance: undefined });
});

let api: ReturnType<typeof fakeFetch>;
function setup(instance: Record<string, unknown> | null = null, routes: Parameters<typeof fakeFetch>[0] = {}) {
  Object.assign(page.data, { instance });
  api = fakeFetch({ "POST /api/setup": { user: null }, "POST /api/setup/test-email": { ok: true }, ...routes });
  vi.stubGlobal("fetch", api.fetch);
  render(SetupPage);
}

const cont = () => screen.getByRole("button", { name: "Continue" });
const input = (label: string, value: string) => fireEvent.input(screen.getByLabelText(label), { target: { value } });
const setupBody = () => api.calls.find((c) => c.path === "/api/setup")?.body as Record<string, unknown> | undefined;
const currentStep = () => document.querySelector("ol li span.text-foreground")?.textContent;

async function toAdminStep(name = "Starlog") {
  await input("Instance name", name);
  await fireEvent.click(cont());
}

async function toEmailStep() {
  await toAdminStep();
  await input("Username", "Ada_1");
  await input("Email", " ada@example.com ");
  await input("Password", "a-long-enough-password");
  await fireEvent.click(cont());
}

test("prefills a real domain and a custom name, but not localhost or the default name", () => {
  setup({ name: "Starlog", domain: "blog.example" });
  expect(screen.getByLabelText("Instance name")).toHaveValue("Starlog");
  expect(screen.getByLabelText(/Public domain/)).toHaveValue("blog.example");
});

test("a localhost domain and the default name start blank", () => {
  setup({ name: "Omicron", domain: "localhost:5173" });
  expect(screen.getByLabelText("Instance name")).toHaveValue("");
  expect(screen.getByLabelText(/Public domain/)).toHaveValue("");
  expect(cont()).toBeDisabled();
});

test("the admin step needs a valid username, an email and a 12-character password", async () => {
  setup();
  await toAdminStep();
  expect(currentStep()).toBe("Admin");
  await input("Username", "ab");
  await input("Email", "ada@example.com");
  await input("Password", "a-long-enough-password");
  expect(cont()).toBeDisabled();
  await input("Username", "Ada_1");
  expect(cont()).toBeEnabled();
  await input("Password", "short");
  expect(cont()).toBeDisabled();
  await input("Password", "a-long-enough-password");
  await input("Email", "no-at-sign");
  expect(cont()).toBeDisabled();
});

test("the password can be revealed", async () => {
  setup();
  await toAdminStep();
  expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  await fireEvent.click(screen.getByRole("button", { name: "Show password" }));
  expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
});

test("Back returns to the previous step with its values kept", async () => {
  setup();
  await toAdminStep("Kept name");
  await fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByLabelText("Instance name")).toHaveValue("Kept name");
});

test("finishing with console mail submits normalized details, signs in and goes home", async () => {
  setup();
  await toEmailStep();
  await fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
  await waitFor(() => expect(goto).toHaveBeenCalledWith("/"));
  expect(invalidateAll).toHaveBeenCalled();
  expect(setupBody()).toEqual({
    appName: "Starlog",
    email: { mode: "console" },
    admin: { username: "ada_1", email: "ada@example.com", password: "a-long-enough-password" },
  });
});

test("SMTP details are submitted, and a test email defaults to the admin address", async () => {
  setup();
  await toEmailStep();
  await fireEvent.click(screen.getByRole("radio", { name: /^SMTP server/ }));
  await input("SMTP host", " smtp.example.com ");
  await input("Port", "465");
  await fireEvent.click(screen.getByRole("button", { name: "Send test" }));
  await screen.findByText(/Test email sent/);
  expect(api.calls.at(-1)?.body).toEqual({
    to: "ada@example.com",
    email: { mode: "smtp", smtp: { host: "smtp.example.com", port: 465, tls: false } },
  });
  await fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
  await waitFor(() => expect(setupBody()).toBeDefined());
  expect(setupBody()?.email).toEqual({ mode: "smtp", smtp: { host: "smtp.example.com", port: 465, tls: false } });
});

test("relay mode submits the API key and from address", async () => {
  setup();
  await toEmailStep();
  await fireEvent.click(screen.getByRole("radio", { name: /^API key/ }));
  await input("From address", "Blog <hi@blog.example>");
  await input("Resend API key", "re_123");
  await fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
  await waitFor(() => expect(setupBody()).toBeDefined());
  expect(setupBody()?.email).toEqual({
    mode: "relay",
    from: "Blog <hi@blog.example>",
    relay: { provider: "resend", apiKey: "re_123" },
  });
});

test("a failed test email is shown", async () => {
  setup(null, { "POST /api/setup/test-email": apiError(502, "Connection refused") });
  await toEmailStep();
  await fireEvent.click(screen.getByRole("radio", { name: /^SMTP server/ }));
  await input("Send a test email to", "ops@example.com");
  await fireEvent.click(screen.getByRole("button", { name: "Send test" }));
  await screen.findByText("Connection refused");
  expect(api.calls.at(-1)?.body).toMatchObject({ to: "ops@example.com" });
});

test("a refused admin account sends the operator back to the Admin step", async () => {
  // The backend names the field a refusal is about (routes/setup.ts).
  setup(null, {
    "POST /api/setup": Response.json({ error: "Username is already taken", field: "admin" }, { status: 400 }),
  });
  await toEmailStep();
  await fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
  await screen.findByText("Username is already taken");
  expect(currentStep()).toBe("Admin");
  expect(goto).not.toHaveBeenCalled();
});

test("a refused instance name sends the operator back to the Instance step", async () => {
  setup(null, {
    "POST /api/setup": Response.json({ error: "Name is too long", field: "appName" }, { status: 400 }),
  });
  await toEmailStep();
  await fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
  await screen.findByText("Name is too long");
  expect(currentStep()).toBe("Instance");
});

test("a server error keeps the operator on the Email step", async () => {
  setup(null, { "POST /api/setup": apiError(500, "Database unavailable") });
  await toEmailStep();
  await fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
  await screen.findByText("Database unavailable");
  expect(currentStep()).toBe("Email");
});

test("a refused SMTP port keeps the operator on the Email step", async () => {
  setup(null, { "POST /api/setup": apiError(400, "Number must be less than or equal to 65535") });
  await toEmailStep();
  await fireEvent.click(screen.getByRole("radio", { name: /^SMTP server/ }));
  await input("Port", "70000");
  await fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
  await screen.findByText("Number must be less than or equal to 65535");
  expect(currentStep()).toBe("Email");
});
