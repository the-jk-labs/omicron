// SPDX-License-Identifier: AGPL-3.0-or-later

// Transactional email. A tiny transport abstraction — the call site
// (`sendMail`) is stable, so the delivery backend can be swapped in one place,
// mirroring the queue and rate-limit abstractions.
//
// Two transports ship:
//   - `console` (default): logs the message and any link to stdout. Requires no
//     configuration, so password reset / verification work out of the box for
//     local dev and small single-user instances.
//   - `smtp`: real delivery via any SMTP server (or a provider's SMTP relay).
//     The client is imported lazily, so nothing SMTP-related loads unless an
//     instance opts in.
//
// The effective configuration is resolved per-send from the web-managed email
// settings (DB → env → default; see services/emailSettings.ts), so a change
// made in the setup wizard or admin page takes effect immediately — no restart,
// no config file to edit.

import { type EmailConfig, getEmailConfig } from "@/services/emailSettings.ts";
import { getOrigin } from "@/services/instanceSetup.ts";

export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain-text body (always sent). */
  text: string;
  /** Optional HTML body. Falls back to `text` when omitted. */
  html?: string;
};

interface Transport {
  send(msg: EmailMessage): Promise<void>;
}

// Logs the message instead of delivering it. Invaluable in dev: the reset /
// verification link is printed to the backend log, so the flow is fully
// exercisable without an SMTP server.
function consoleTransport(cfg: EmailConfig): Transport {
  return {
    send(msg) {
      console.log(
        [
          "",
          "──────────── EMAIL (console transport) ────────────",
          `From:    ${cfg.from}`,
          `To:      ${msg.to}`,
          `Subject: ${msg.subject}`,
          "",
          msg.text,
          "───────────────────────────────────────────────────",
          "",
        ].join("\n"),
      );
      return Promise.resolve();
    },
  };
}

// SMTP delivery via denomailer, loaded lazily so the dependency is only fetched
// when an instance actually uses SMTP. The specifier is held in a variable so
// `deno check` doesn't eagerly resolve it (the transport is optional and only
// needed at runtime).
function smtpTransport(cfg: EmailConfig): Transport {
  return {
    async send(msg) {
      if (!cfg.smtp.host) {
        throw new Error("Email mode is SMTP but no SMTP host is configured.");
      }
      const specifier = "https://deno.land/x/denomailer@1.6.0/mod.ts";
      // deno-lint-ignore no-explicit-any
      const { SMTPClient } = (await import(specifier)) as any;
      const client = new SMTPClient({
        connection: {
          hostname: cfg.smtp.host,
          port: cfg.smtp.port,
          tls: cfg.smtp.tls,
          auth: cfg.smtp.username && cfg.smtp.password
            ? { username: cfg.smtp.username, password: cfg.smtp.password }
            : undefined,
        },
      });
      try {
        await client.send({
          from: cfg.from,
          to: msg.to,
          subject: msg.subject,
          content: msg.text,
          html: msg.html,
        });
      } finally {
        // Best-effort: a failed connection can leave the client half-open, so a
        // throwing close() must not mask the real send error.
        try {
          await client.close();
        } catch { /* ignore */ }
      }
    },
  };
}

function transportFor(cfg: EmailConfig): Transport {
  return cfg.mode === "smtp" ? smtpTransport(cfg) : consoleTransport(cfg);
}

/** Deliver one message through the currently-configured transport. */
export async function sendMail(msg: EmailMessage): Promise<void> {
  await transportFor(await getEmailConfig()).send(msg);
}

/**
 * Send a diagnostic message to verify delivery works. `override` lets the setup
 * wizard / admin page test details the operator has entered but not yet saved;
 * omit it to test the stored configuration. Throws on failure so the caller can
 * surface the transport error verbatim.
 */
export async function sendTestEmail(to: string, override?: EmailConfig): Promise<void> {
  const cfg = override ?? await getEmailConfig();
  await transportFor(cfg).send({
    to,
    subject: "Omicron email test",
    text:
      "This is a test message from your Omicron instance.\n\nIf you received it, outbound email is working.",
    html: layout(
      "Email is working",
      "This is a test message from your Omicron instance. If you received it, outbound email is working.",
      { label: "Open your instance", url: await getOrigin() },
    ),
  });
}

// ── Templates ──────────────────────────────────────────────────────────────
// Kept plain and self-contained. Both a text and a lightly-styled HTML body are
// provided so clients render nicely without pulling in a templating dependency.

function layout(heading: string, body: string, cta: { label: string; url: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:440px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:32px">
      <tr><td>
        <h1 style="margin:0 0 12px;font-size:20px;font-weight:700">${heading}</h1>
        <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#52525b">${body}</p>
        <a href="${cta.url}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px">${cta.label}</a>
        <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#a1a1aa">If the button doesn't work, copy and paste this link:<br><span style="color:#52525b;word-break:break-all">${cta.url}</span></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

/** Password-reset mail with a tokened link. */
export async function sendPasswordReset(to: string, token: string): Promise<void> {
  const url = `${await getOrigin()}/reset-password?token=${encodeURIComponent(token)}`;
  return sendMail({
    to,
    subject: "Reset your Omicron password",
    text:
      `Someone requested a password reset for your account.\n\nReset it here (valid for 1 hour):\n${url}\n\nIf you didn't request this, you can safely ignore this email.`,
    html: layout(
      "Reset your password",
      "Someone requested a password reset for your account. This link is valid for one hour. If you didn't request it, you can safely ignore this email.",
      { label: "Reset password", url },
    ),
  });
}

/** Email-verification mail with a tokened link. */
export async function sendEmailVerification(to: string, token: string): Promise<void> {
  const url = `${await getOrigin()}/verify-email?token=${encodeURIComponent(token)}`;
  return sendMail({
    to,
    subject: "Confirm your Omicron email",
    text:
      `Welcome to Omicron! Confirm your email address to finish setting up your account (valid for 24 hours):\n${url}\n\nIf you didn't create this account, you can ignore this email.`,
    html: layout(
      "Confirm your email",
      "Welcome to Omicron! Confirm your email address to finish setting up your account. This link is valid for 24 hours.",
      { label: "Confirm email", url },
    ),
  });
}
