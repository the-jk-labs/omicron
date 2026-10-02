import AdminEmail from "$lib/components/AdminEmail.svelte";
import type { EmailDnsRecords, EmailSettings } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, expect, test, vi } from "vitest";
import { apiError, fakeFetch } from "../../fakeFetch";

function settings(o: Partial<EmailSettings> = {}): EmailSettings {
  return {
    mode: "console",
    from: "Omicron <no-reply@blog.example>",
    smtp: { port: 587, tls: false, hasPassword: false },
    relay: { provider: "resend", hasApiKey: false },
    dkim: { selector: "omicron", hasKey: false },
    ...o,
  };
}

const records: EmailDnsRecords = {
  dkim: { host: "omicron._domainkey.blog.example", type: "TXT", value: "v=DKIM1; k=rsa; p=AAA" },
  spf: { host: "blog.example", type: "TXT", value: "v=spf1 a mx ~all" },
  dmarc: { host: "_dmarc.blog.example", type: "TXT", value: "v=DMARC1; p=none" },
};

let api: ReturnType<typeof fakeFetch>;
function setup(initial: EmailSettings = settings(), routes: Parameters<typeof fakeFetch>[0] = {}) {
  api = fakeFetch({
    "GET /api/admin/email": initial,
    "PUT /api/admin/email": (req) =>
      req
        .json()
        .then((b: { mode: EmailSettings["mode"]; from?: string }) =>
          Response.json(settings({ ...initial, mode: b.mode, from: b.from ?? "" })),
        ),
    ...routes,
  });
  vi.stubGlobal("fetch", api.fetch);
  render(AdminEmail);
}

const putBody = () => api.calls.find((c) => c.method === "PUT")?.body;
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
async function pickMode(name: RegExp) {
  await fireEvent.click(screen.getByRole("radio", { name }));
}

const writeText = vi.fn<(s: string) => Promise<void>>();
beforeEach(() => {
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

test("console mode warns that nothing is delivered", async () => {
  setup();
  await waitFor(() => expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled());
  expect(screen.getByRole("radio", { name: /^Console/ })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByText(/Nothing is delivered in this mode/)).toBeInTheDocument();
  expect(screen.queryByLabelText("From address")).toBe(null);
});

test("a failed load is shown", async () => {
  setup(settings(), { "GET /api/admin/email": apiError(500, "Settings unreadable") });
  await screen.findByText("Settings unreadable");
});

test("saved SMTP settings load with secrets left blank", async () => {
  setup(
    settings({
      mode: "smtp",
      smtp: { host: "smtp.example.com", port: 465, username: "me", tls: true, hasPassword: true },
    }),
  );
  await waitFor(() => expect(screen.getByLabelText("SMTP host")).toHaveValue("smtp.example.com"));
  expect(screen.getByLabelText("Port")).toHaveValue(465);
  expect(screen.getByLabelText("Username")).toHaveValue("me");
  expect(screen.getByLabelText("Password / API key")).toHaveValue("");
  expect(screen.getByLabelText("Password / API key")).toHaveAttribute("placeholder", "•••••••• (unchanged)");
});

test("a provider preset fills host, port and username", async () => {
  setup(settings({ mode: "smtp" }));
  const preset = await screen.findByLabelText("Provider preset");
  await fireEvent.change(preset, { target: { value: "SendGrid" } });
  expect(screen.getByLabelText("SMTP host")).toHaveValue("smtp.sendgrid.net");
  expect(screen.getByLabelText("Port")).toHaveValue(587);
  expect(screen.getByLabelText("Username")).toHaveValue("apikey");
  expect(screen.getByText(/Username is literally 'apikey'/)).toBeInTheDocument();
  // A preset without a username leaves the typed one alone.
  await fireEvent.input(screen.getByLabelText("Username"), { target: { value: "mine" } });
  await fireEvent.change(preset, { target: { value: "Mailgun" } });
  expect(screen.getByLabelText("Username")).toHaveValue("mine");
});

test("SMTP saves trimmed fields and omits a blank password (unchanged)", async () => {
  setup(settings({ mode: "smtp" }));
  await waitFor(() => expect(screen.getByLabelText("SMTP host")).toBeInTheDocument());
  await fireEvent.input(screen.getByLabelText("From address"), { target: { value: "  Blog <hi@blog.example> " } });
  await fireEvent.input(screen.getByLabelText("SMTP host"), { target: { value: " smtp.blog.example " } });
  await fireEvent.input(screen.getByLabelText("Username"), { target: { value: "  " } });
  await save();
  await screen.findByText("Saved.");
  expect(putBody()).toEqual({
    mode: "smtp",
    from: "Blog <hi@blog.example>",
    smtp: { host: "smtp.blog.example", port: 587, tls: false },
  });
});

test("relay mode sends only the API key", async () => {
  setup();
  await waitFor(() => expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled());
  await pickMode(/^API relay/);
  await fireEvent.input(screen.getByLabelText("Resend API key"), { target: { value: "re_123" } });
  await save();
  await screen.findByText("Saved.");
  expect(putBody()).toEqual({
    mode: "relay",
    from: "Omicron <no-reply@blog.example>",
    relay: { provider: "resend", apiKey: "re_123" },
  });
});

test("a refused save is shown", async () => {
  setup(settings(), { "PUT /api/admin/email": apiError(400, "From address is required") });
  await waitFor(() => expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled());
  await save();
  await screen.findByText("From address is required");
  expect(screen.queryByText("Saved.")).toBe(null);
});

test("direct mode checks port 25 and reports either way", async () => {
  setup(settings({ mode: "direct" }), {
    "GET /api/admin/email/port25": { ok: false, detail: "Connection to gmail-smtp-in timed out" },
  });
  await fireEvent.click(await screen.findByRole("button", { name: "Check port 25" }));
  await screen.findByText("Port 25 blocked");
  expect(screen.getByText("Connection to gmail-smtp-in timed out")).toBeInTheDocument();
});

test("a failing port check is reported as blocked with the reason", async () => {
  setup(settings({ mode: "direct" }), { "GET /api/admin/email/port25": apiError(500, "Probe crashed") });
  await fireEvent.click(await screen.findByRole("button", { name: "Check port 25" }));
  await screen.findByText("Probe crashed");
  expect(screen.getByText("Port 25 blocked")).toBeInTheDocument();
});

test("the DNS domain defaults to the From address's domain", async () => {
  setup(settings({ mode: "direct" }));
  await waitFor(() => expect(screen.getByPlaceholderText("example.com")).toHaveValue("blog.example"));
  expect(screen.getByRole("button", { name: "Verify DNS" })).toBeDisabled();
});

test("generating keys shows the records to publish, each copyable", async () => {
  setup(settings({ mode: "direct" }), {
    "POST /api/admin/email/dkim": { domain: "blog.example", selector: "omicron", records },
  });
  await waitFor(() => expect(screen.getByPlaceholderText("example.com")).toHaveValue("blog.example"));
  await fireEvent.click(screen.getByRole("button", { name: "Generate keys" }));
  await screen.findByText("v=spf1 a mx ~all");
  expect(api.calls.at(-1)?.body).toEqual({ domain: "blog.example" });
  expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Verify DNS" })).toBeEnabled();
  await fireEvent.click(screen.getByText("_dmarc.blog.example"));
  expect(writeText).toHaveBeenCalledWith("_dmarc.blog.example");
  await screen.findByText("copied ✓");
});

test("verifying DNS marks each record and says whether mail is healthy", async () => {
  setup(settings({ mode: "direct", dkim: { domain: "blog.example", selector: "omicron", hasKey: true } }), {
    "GET /api/admin/email/dns": {
      records,
      report: {
        domain: "blog.example",
        mx: { host: "blog.example", ok: true, expected: "", found: [] },
        spf: { host: "blog.example", ok: true, expected: "", found: [] },
        dkim: { host: "omicron._domainkey.blog.example", ok: true, expected: "", found: [] },
        dmarc: { host: "_dmarc.blog.example", ok: false, expected: "", found: [] },
        healthy: true,
      },
    },
  });
  await fireEvent.click(await screen.findByRole("button", { name: "Verify DNS" }));
  await screen.findByText("DNS looks healthy. DKIM and SPF are published.");
  expect(screen.getAllByText("ok")).toHaveLength(2);
  expect(screen.getAllByText("missing")).toHaveLength(1);
});

test("DNS failures are shown", async () => {
  setup(settings({ mode: "smtp", dkim: { domain: "blog.example", selector: "omicron", hasKey: true } }), {
    "POST /api/admin/email/dkim": apiError(400, "Invalid domain"),
    "GET /api/admin/email/dns": apiError(502, "Resolver timeout"),
  });
  await fireEvent.click(await screen.findByRole("button", { name: "Verify DNS" }));
  await screen.findByText("Resolver timeout");
  await fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
  await screen.findByText("Invalid domain");
});

test("the DNS section is only offered for SMTP and direct delivery", async () => {
  setup(settings({ mode: "relay" }));
  await waitFor(() => expect(screen.getByLabelText("Resend API key")).toBeInTheDocument());
  expect(screen.queryByText("Sending domain (DKIM / SPF / DMARC)")).toBe(null);
});

test("a test email goes to the trimmed address and reports the outcome", async () => {
  let n = 0;
  setup(settings(), {
    "POST /api/admin/email/test": () => (++n === 1 ? Response.json({ ok: true }) : apiError(502, "SMTP said no")),
  });
  const send = screen.getByRole("button", { name: "Send test" });
  expect(send).toBeDisabled();
  await fireEvent.input(screen.getByLabelText("Send a test email to"), { target: { value: " me@blog.example " } });
  await fireEvent.click(send);
  await screen.findByText(/Test email sent/);
  expect(api.calls.at(-1)?.body).toEqual({ to: "me@blog.example" });
  await fireEvent.click(send);
  await screen.findByText("SMTP said no");
});
