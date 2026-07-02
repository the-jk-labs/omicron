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

- [x] **Auto-generate `SESSION_SECRET`** if unset — generated on first boot and
      persisted (mode 0600), never to stdout, so restarts/upgrades keep sessions
      valid. Resolution order: `SESSION_SECRET` env → `SESSION_SECRET_FILE` →
      generate & persist to `STATE_DIR` (`config.ts`). In compose the
      `init-secrets` service writes the file into the `secrets` volume.
- [x] **Auto-generate the Postgres password** on first boot — `init-secrets`
      generates it into the `secrets` volume; Postgres reads it via
      `POSTGRES_PASSWORD_FILE` and the backend assembles `DATABASE_URL` from
      `POSTGRES_*` + the same file. The shipped `omicron:omicron` default is
      gone; existing `.env` `DATABASE_URL`/`SESSION_SECRET` still override.
- [x] **Make `APP_DOMAIN` optional at boot** — defaults to `localhost:5173` so
      the app is reachable before configuration. (Request-host defaulting and
      the wizard-set value land in S1.)
- [x] **Trim `.env.example` to "advanced overrides only"** — every var is now
      commented out; `docker compose up` works with no `.env` at all.

## S1 — First-run web wizard

Replace `.env` editing with a browser setup screen shown on first boot, gated
until setup completes.

- [x] **Setup state** — `services/instanceSetup.ts` tracks completion over the
      existing `instance_settings` KV store (`setup.completed`, with a
      "any user exists" fallback so pre-wizard/env instances are treated as
      already configured). The frontend `+layout.server.ts` gate redirects every
      route to `/setup` until complete, and redirects `/setup` back to `/` after.
- [x] **Wizard steps** — a 3-step `/setup` page (instance name + domain → admin
      account → email choice). Submits to `POST /api/setup`, which creates the
      admin (first user → admin, auto-verified), signs them in, and persists the
      settings; no restart for app-level values. Single-shot: a 409 guard means
      it can't run once an admin exists.
- [x] **Settings precedence** — effective value is DB (wizard) → env → default,
      via `getAppName` / `getAppDomain` / `getEmailMode`. App name flows to the
      frontend via `GET /api/instance` (Nav/Discover/layout), so existing
      env-configured instances keep working unchanged.
- Files: `services/instanceSetup.ts`, `routes/setup.ts` (+ mount in
  `routes/index.ts`), reusing `db/repositories/instanceSettings.ts`; frontend
  `routes/setup/+page.svelte`, `+layout.server.ts` gate, `lib/api`, `lib/types`,
  and the `Nav`/`Discover`/layout app-name wiring. (Domain change reaches
  ActivityPub on restart — see the accessor note; deferred with S2 federation.)

## S2 — Bundled HTTPS + effortless domain

Bringing up a new instance on a fresh domain should feel effortless.

- [x] **Add Caddy to the compose stack** as the single public entrypoint
      (`caddy:2-alpine`, ports `${HTTP_PORT:-80}`/`${HTTPS_PORT:-443}`). The
      `Caddyfile` routes federation paths (`/.well-known/*`, `/users/*`,
      `/inbox`, `/nodeinfo*`) to the backend and everything else to the frontend
      via mutually-exclusive `handle` blocks.
- [x] **Automatic Let's Encrypt TLS with no domain in any file** — Caddy
      on-demand TLS learns the hostname from the request and issues a cert,
      gated by the backend ask endpoint `GET /api/instance/tls-check`
      (`isTlsDomainAllowed`: only the saved domain + `www.`, with a pre-setup
      bootstrap window; never `localhost`). Certs persist in the `caddy_data`
      volume across upgrades. The domain from the S1 wizard tightens the gate.
- [x] **Local/dev fallback** — `http://localhost` is served over plain HTTP (no
      cert dance); real domains on `:80` redirect to HTTPS. `docker compose up`
      still works with no domain, and the frontend trusts Caddy's
      `X-Forwarded-Proto`/`-Host`/`-For` so external origins/links are correct.
- [x] **Document the one manual prerequisite** — README "Going public" section:
      a single A/AAAA DNS record is the only manual step; HTTPS is automatic.
- Files: `Caddyfile`, `docker-compose.yml` (caddy service + volumes + frontend
  proxy headers), `services/instanceSetup.ts` (`isTlsDomainAllowed`),
  `routes/setup.ts` (`/tls-check`), `.env.example`, `README.md`.
  (Caveat: the backend session-cookie `secure` flag is still keyed off env
  `APP_DOMAIN`, so a wizard-only domain change reaches it on restart — same
  restart boundary noted in S1; hardened in S4 admin settings.)

## S3 — Automatic noreply email

Goal: `noreply@domain` mail works with the least possible friction.

> **Honest caveat.** Fully-automatic *deliverable* outbound email cannot be done
> purely in-container: it needs DNS records (SPF, DKIM, DMARC) and an unblocked
> port 25, which most hosts block and fresh IPs get spam-filtered on. So "just
> works" means one of the two paths below, chosen in the wizard.

- [x] **Web-managed email, zero env editing.** Email is fully configured from
      the wizard/admin page and stored in `instance_settings`
      (`services/emailSettings.ts`, DB → env → default precedence). The transport
      is resolved **per-send** from that config (`services/email.ts`), so a
      change takes effect immediately with no restart. `console` stays the
      zero-config default; `smtp` covers any server **or provider relay** (Path A
      via the provider's SMTP endpoint — paste host + key, no lock-in).
- [x] **Wizard email step validates live.** The `/setup` email step collects the
      SMTP details and sends a real **test message** (`POST /api/setup/test-email`,
      open only pre-setup) so the operator confirms delivery before finishing —
      never editing `SMTP_*` by hand. Admin parity ships too:
      `GET/PUT /api/admin/email` (password redacted to `hasPassword`) and
      `POST /api/admin/email/test`; the admin *page* UI lands in S4.
- [x] **Correct links.** Outbound email (reset/verify/test) now builds URLs from
      the effective domain (`instanceSetup.getOrigin()`), so a wizard-set domain
      is reflected without a restart.
- [ ] **Path B — self-host SMTP + guided DNS (deferred).** Bundling a sender that
      **generates SPF/DKIM/DMARC records and verifies them live** is a larger
      effort; deferred. Until then, deliverable mail uses an external SMTP relay
      (the honest caveat above: fresh-IP self-send needs DNS + an open port 25).
- [ ] **One-key HTTP relay APIs (deferred).** Native HTTP API transports (vs the
      universal SMTP path) can come later if a true single-field key is wanted.
- Files: `services/emailSettings.ts`, `services/email.ts` (per-send transport +
  `sendTestEmail`), `services/instanceSetup.ts` (`getOrigin`, `completeSetup`
  email), `routes/setup.ts` (`/test-email`), `routes/admin.ts` (email CRUD +
  test); frontend `routes/setup/+page.svelte`, `lib/api`, `lib/types`.

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
