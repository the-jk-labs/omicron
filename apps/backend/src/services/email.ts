// SPDX-License-Identifier: AGPL-3.0-or-later

// Transactional email. A tiny transport abstraction — the call site
// (`sendMail`) is stable, so the delivery backend can be swapped in one place,
// mirroring the queue and rate-limit abstractions.
//
// Four transports ship:
//   - `console` (default): logs the message + link to stdout (zero config).
//   - `smtp`: any SMTP server / provider SMTP endpoint, via our own minimal
//     client (lib/smtp.ts) so errors are precise and messages can be DKIM-signed.
//   - `relay`: a provider's HTTP API — one pasted API key (Path A). Resend today.
//   - `direct`: self-hosted, sent straight to the recipient's MX and DKIM-signed
//     (Path B); needs the published DNS records and an open port 25.
//
// The effective configuration is resolved per-send from the web-managed email
// settings (DB → env → default; see services/emailSettings.ts), so a change
// made in the setup wizard or admin page takes effect immediately — no restart,
// no config file to edit.

import { type EmailConfig, getEmailConfig } from "@/services/emailSettings.ts";
import { getOrigin } from "@/services/instanceSetup.ts";
import { sendSmtp } from "@/lib/smtp.ts";
import { buildMessage, domainOf, extractAddress, serializeMessage } from "@/lib/mime.ts";
import { signMessage } from "@/services/dkim.ts";

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

// Build the raw message bytes for one recipient, DKIM-signing it when a key is
// configured for the From domain (so `smtp` and `direct` both authenticate).
async function buildSigned(cfg: EmailConfig, msg: EmailMessage): Promise<{
  fromAddress: string;
  data: Uint8Array;
}> {
  const built = buildMessage({
    from: cfg.from,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });
  let headers = built.headers;
  const fromDomain = domainOf(built.fromAddress);
  if (cfg.dkim.privateKey && cfg.dkim.domain && cfg.dkim.domain === fromDomain) {
    const dkim = await signMessage(built.headers, built.body, {
      domain: cfg.dkim.domain,
      selector: cfg.dkim.selector,
      privateKey: cfg.dkim.privateKey,
    });
    const [name, ...rest] = dkim.split(": ");
    headers = [[name, rest.join(": ")], ...built.headers];
  }
  return { fromAddress: built.fromAddress, data: serializeMessage(headers, built.body) };
}

// Delivery via a configured SMTP server (our own client, TLS required).
function smtpTransport(cfg: EmailConfig): Transport {
  return {
    async send(msg) {
      if (!cfg.smtp.host) {
        throw new Error("Email mode is SMTP but no SMTP host is configured.");
      }
      const { fromAddress, data } = await buildSigned(cfg, msg);
      await sendSmtp({
        hostname: cfg.smtp.host,
        port: cfg.smtp.port,
        implicitTls: cfg.smtp.tls,
        starttls: cfg.smtp.tls ? "never" : "require",
        username: cfg.smtp.username,
        password: cfg.smtp.password,
        heloName: domainOf(fromAddress) || undefined,
      }, { from: fromAddress, to: extractAddress(msg.to), data });
    },
  };
}

// Delivery via a provider's HTTP API — the operator pastes one API key.
function relayTransport(cfg: EmailConfig): Transport {
  return {
    async send(msg) {
      if (!cfg.relay.apiKey) {
        throw new Error("Email mode is relay but no API key is configured.");
      }
      if (cfg.relay.provider !== "resend") {
        throw new Error(`Unsupported relay provider: ${cfg.relay.provider}`);
      }
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "authorization": `Bearer ${cfg.relay.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: cfg.from,
          to: [extractAddress(msg.to)],
          subject: msg.subject,
          text: msg.text,
          html: msg.html,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Relay (resend) returned ${res.status}: ${body.slice(0, 300)}`);
      }
    },
  };
}

// Self-hosted delivery: resolve the recipient domain's MX and hand the
// DKIM-signed message straight to it (opportunistic STARTTLS). No third party,
// but deliverability depends on an open outbound port 25 and clean reverse DNS.
function directTransport(cfg: EmailConfig): Transport {
  return {
    async send(msg) {
      const { fromAddress, data } = await buildSigned(cfg, msg);
      const domain = domainOf(extractAddress(msg.to));
      if (!domain) throw new Error(`Invalid recipient address: ${msg.to}`);

      let mx: { preference: number; exchange: string }[];
      try {
        mx = await Deno.resolveDns(domain, "MX");
      } catch (err) {
        throw new Error(
          `No MX records for ${domain}: ${err instanceof Error ? err.message : err}`,
        );
      }
      const hosts = mx.sort((a, b) => a.preference - b.preference).map((r) => r.exchange);
      if (hosts.length === 0) throw new Error(`No MX records for ${domain}`);

      const errors: string[] = [];
      for (const host of hosts) {
        try {
          await sendSmtp({
            hostname: host,
            port: 25,
            implicitTls: false,
            starttls: "opportunistic",
            heloName: domainOf(fromAddress) || undefined,
          }, { from: fromAddress, to: extractAddress(msg.to), data });
          return; // delivered to the first MX that accepts
        } catch (err) {
          errors.push(`${host}: ${err instanceof Error ? err.message : err}`);
        }
      }
      throw new Error(`Direct delivery to ${domain} failed. Tried: ${errors.join("; ")}`);
    },
  };
}

function transportFor(cfg: EmailConfig): Transport {
  switch (cfg.mode) {
    case "smtp":
      return smtpTransport(cfg);
    case "relay":
      return relayTransport(cfg);
    case "direct":
      return directTransport(cfg);
    default:
      return consoleTransport(cfg);
  }
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
