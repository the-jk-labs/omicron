# Pre-release: toy-easy setup

The bar for 1.0 self-hosting: **as easy as a child's toy.** An operator runs
Docker or Podman once and gets a working, federating instance on their own
domain — with **no config files to edit**. Anything a human must decide happens
in a **first-run web wizard** or the **admin page**, never in a text editor.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done.

Tiers are ordered. This document is the setup-experience track; product and
federation work lives in [ROADMAP.md](ROADMAP.md).

---

## Where we are today

The plumbing is close but three things still demand a human editing files or
wiring infrastructure by hand — and those are the "toy" breakers:

- **Hand-edited `.env`** — `cp .env.example .env`, run `openssl rand -hex 32`
  for `SESSION_SECRET`, set `APP_DOMAIN` by hand.
- **No HTTPS / reverse proxy** — going public with a real domain means bolting on
  Caddy/Traefik and TLS yourself. Federation effectively needs HTTPS.
- **Email is not automatic** — default transport is `console` (logs to stdout);
  real mail means hand-filling `SMTP_*`.

The good bones already in place: single `docker compose up`, auto-migrations on
boot, data in named volumes, first-registrant-becomes-admin.

---

## S0 — Zero-config boot

No required environment variables. `docker compose up` (or `podman`) must yield a
running instance with sane defaults and no secrets to invent.

- [ ] **Auto-generate `SESSION_SECRET`** if unset — generate a strong random
      value on first boot and persist it to the data volume (not stdout), so
      restarts and upgrades keep sessions valid. Never require the operator to
      run `openssl`.
- [ ] **Auto-generate the Postgres password** on first boot and wire both
      services to it via the same persisted secret; drop the shipped
      `omicron:omicron` default so no instance runs with a known password.
- [ ] **Make `APP_DOMAIN` optional at boot** — default to the request host until
      the wizard sets it, so the app is reachable before configuration.
- [ ] **Trim `.env.example` to "advanced overrides only"** — the happy path
      needs an empty (or absent) `.env`. Document that editing it is optional.

## S1 — First-run web wizard

Replace `.env` editing with a browser setup screen shown on first boot, gated
until setup completes.

- [ ] **Setup state** — persist a "configured" flag + wizard-managed settings in
      the DB (new `instance_settings` repository); a middleware redirects to
      `/setup` until the flag is set, and 404s the wizard afterward.
- [ ] **Wizard steps** — domain, public app name, admin account (email +
      password), and email choice (see S3). Validates the domain and writes
      settings through a service, no restart required.
- [ ] **Settings precedence** — DB-backed settings override env; env overrides
      built-in defaults. Existing env-configured instances keep working
      unchanged (env still wins where the wizard hasn't run).
- Files (planned): `routes/setup.ts`, `services/instanceSettings.ts`,
  `db/repositories/instanceSettings.ts`, migration `00xx_instance_settings`,
  frontend `routes/setup/`.

## S2 — Bundled HTTPS + effortless domain

Bringing up a new instance on a fresh domain should feel effortless.

- [ ] **Add Caddy to the compose stack** as the single public entrypoint,
      reverse-proxying frontend + backend federation paths (`/.well-known`,
      `/users`, inbox/outbox).
- [ ] **Automatic Let's Encrypt TLS** — operator provides the domain once (env
      or wizard) and gets valid HTTPS with zero certbot steps; certs persist in a
      volume across upgrades.
- [ ] **Local/dev fallback** — internal TLS or plain HTTP on `localhost` so the
      no-domain path still works out of the box.
- [ ] **Document the one manual prerequisite** clearly: an A/AAAA DNS record
      pointing at the host. This is the irreducible step; everything after is
      automatic.

## S3 — Automatic noreply email

Goal: `noreply@domain` mail works with the least possible friction.

> **Honest caveat.** Fully-automatic *deliverable* outbound email cannot be done
> purely in-container: it needs DNS records (SPF, DKIM, DMARC) and an unblocked
> port 25, which most hosts block and fresh IPs get spam-filtered on. So "just
> works" means one of the two paths below, chosen in the wizard.

- [ ] **Path A — relay API key (easiest).** Operator pastes one API key
      (e.g. a transactional provider); mail just works, no DNS. One third-party
      dependency, no lock-in beyond swapping the key.
- [ ] **Path B — self-host SMTP + guided DNS.** Bundle a lightweight sender; the
      wizard/admin page **generates the exact SPF/DKIM/DMARC records to paste**
      and **verifies them live** before declaring email healthy. Free, fully
      self-hosted, at the cost of pasting three DNS records.
- [ ] **Wizard email step** picks a path and validates it (send a test message /
      poll DNS) so the operator never edits `SMTP_*` by hand.
- Builds on the existing `services/email.ts` transport abstraction (console /
  smtp already pluggable).

## S4 — Admin settings page (runtime config)

Everything the wizard sets, plus ongoing knobs, editable later in the web UI —
so no operator ever returns to a config file.

- [ ] **Instance settings tab** under the existing `/admin` surface: app name,
      domain (with re-verify), email transport + health, federation toggle.
- [ ] **Email health panel** — show DNS/relay status, resend a test message.
- [ ] **Secret rotation** — regenerate `SESSION_SECRET` from the UI (with the
      "signs everyone out" warning) instead of shelling in.

## S5 — Podman parity & upgrades

- [ ] **Verify the stack on Podman / `podman compose`** (rootless) and document
      any differences; keep the compose file engine-agnostic.
- [ ] **Confirm the "toy" upgrade path** — `git pull && docker compose up -d
      --build` (or `podman`) with auto-migrations and persisted secrets/certs,
      end to end, losing no data.
- [ ] **One-liner install** (optional) — a `curl | sh` or single command that
      fetches the compose file and brings the stack up for non-git users.

---

## Done gate

**"Toy-easy" ships when:** a fresh operator can, with only Docker/Podman
installed and one DNS A record pointed at their host, run a single command,
open the browser, finish the wizard, and have a federating HTTPS instance that
sends working `noreply@` mail — having edited **zero** config files.
