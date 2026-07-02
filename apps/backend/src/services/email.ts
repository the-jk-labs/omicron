// SPDX-License-Identifier: AGPL-3.0-or-later

// Transactional email. A tiny transport abstraction — the call site
// (`sendMail`) is stable, so the delivery backend can be swapped in one place,
// mirroring the queue and rate-limit abstractions.
//
// Two transports ship:
//   - `console` (default): logs the message and any link to stdout. Requires no
//     configuration, so password reset / verification work out of the box for
//     local dev and small single-user instances.
//   - `smtp`: real delivery via any SMTP server. The client is imported lazily,
//     so nothing SMTP-related loads unless an instance opts in.

import { config, origin } from "@/config.ts";

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
const consoleTransport: Transport = {
  send(msg) {
    console.log(
      [
        "",
        "──────────── EMAIL (console transport) ────────────",
        `From:    ${config.EMAIL_FROM}`,
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

// SMTP delivery via denomailer, loaded lazily so the dependency is only fetched
// when an instance actually configures `EMAIL_TRANSPORT=smtp`. The specifier is
// held in a variable so `deno check` doesn't eagerly resolve it (the transport
// is optional and only needed at runtime).
function smtpTransport(): Transport {
  return {
    async send(msg) {
      if (!config.SMTP_HOST) {
        throw new Error("EMAIL_TRANSPORT=smtp but SMTP_HOST is not set.");
      }
      const specifier = "https://deno.land/x/denomailer@1.6.0/mod.ts";
      // deno-lint-ignore no-explicit-any
      const { SMTPClient } = (await import(specifier)) as any;
      const client = new SMTPClient({
        connection: {
          hostname: config.SMTP_HOST,
          port: config.SMTP_PORT,
          tls: config.SMTP_TLS,
          auth: config.SMTP_USERNAME && config.SMTP_PASSWORD
            ? { username: config.SMTP_USERNAME, password: config.SMTP_PASSWORD }
            : undefined,
        },
      });
      try {
        await client.send({
          from: config.EMAIL_FROM,
          to: msg.to,
          subject: msg.subject,
          content: msg.text,
          html: msg.html,
        });
      } finally {
        await client.close();
      }
    },
  };
}

let transport: Transport | null = null;
function getTransport(): Transport {
  if (!transport) {
    transport = config.EMAIL_TRANSPORT === "smtp" ? smtpTransport() : consoleTransport;
  }
  return transport;
}

/** Deliver one message through the configured transport. */
export function sendMail(msg: EmailMessage): Promise<void> {
  return getTransport().send(msg);
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
export function sendPasswordReset(to: string, token: string): Promise<void> {
  const url = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
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
export function sendEmailVerification(to: string, token: string): Promise<void> {
  const url = `${origin}/verify-email?token=${encodeURIComponent(token)}`;
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
