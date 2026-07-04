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
- [x] **Path A — one-key HTTP relay.** A `relay` mode sends via a provider's HTTP
      API (Resend today): the operator pastes a single API key in the wizard or
      admin page, no SMTP settings. New `relayTransport` in `services/email.ts`;
      key stored (redacted to `hasApiKey`) in `emailSettings`.
- [x] **Path B — self-host + guided DNS.** A `direct` mode delivers straight to
      each recipient's MX, DKIM-signing the message. The admin page **generates an
      RSA-2048 DKIM keypair** (`services/dkim.ts`; private key never leaves the
      server), shows the **exact SPF / DKIM / DMARC records**, and **verifies them
      live** over DNS (`services/emailDns.ts`; `GET /api/admin/email/dns`) before
      declaring email healthy. DKIM signing (relaxed/relaxed, rsa-sha256) also
      applies to the `smtp` path.
- [x] **Own SMTP client.** `lib/smtp.ts` replaces the third-party mailer: precise
      TLS errors (no misleading "auth over insecure" message), no stray background
      promise rejections, and it sends the exact bytes we DKIM-sign
      (`lib/mime.ts`). STARTTLS required for configured servers, opportunistic for
      MX delivery, implicit TLS for 465.
- Honest residual caveat (unchanged from the tier intro): `direct` deliverability
  still depends on an **open outbound port 25** and clean reverse DNS — both
  host-dependent — so most operators will pick the relay or SMTP path. Only Resend
  is wired as an HTTP relay so far; more providers can be added behind the same
  `relay` mode.
- Files: `services/emailSettings.ts` (relay + dkim config, `ensureDkimKeys`),
  `services/email.ts` (console/smtp/relay/direct transports + `sendTestEmail`),
  `services/dkim.ts`, `services/emailDns.ts`, `lib/smtp.ts`, `lib/mime.ts`,
  `services/instanceSetup.ts` (`getOrigin`), `routes/setup.ts` (`/test-email`,
  relay schema), `routes/admin.ts` (email CRUD/test + `/email/dkim`, `/email/dns`);
  frontend `components/AdminEmail.svelte`, `routes/setup/+page.svelte`, `lib/api`,
  `lib/types`.

## S4 — Admin settings page (runtime config)

Everything the wizard sets, plus ongoing knobs, editable later in the web UI —
so no operator ever returns to a config file.

- [x] **Instance settings tab** under `/admin`. The **Instance** tab edits app
      name + public domain (`GET/PUT /api/admin/instance`,
      `instanceSetup.setInstanceIdentity`) with the domain-reaches-ActivityPub-
      on-restart caveat surfaced inline; federation status is shown read-only
      (it's `FEDERATION_ENABLED` env/restart-bound — see below).
- [x] **Email panel** — a dedicated **Email** tab surfacing the S3 endpoints:
      toggle console/SMTP, edit the connection (password write-only, shown as
      `unchanged`), **save**, and **send a live test** (`POST /api/admin/email/test`).
- [x] **Federation toggle (DB-backed, restart-applied).** The Instance tab now
      has a federation switch. `FEDERATION_ENABLED` still gates the boot-time
      Fedify mount, queue handlers, and remote routes — so rather than risk
      inconsistent live re-mounting, the toggle is persisted
      (`instance.federationEnabled`, DB → env → default via
      `getFederationEnabled`/`setFederationEnabled`) and **applied on the next
      restart**. A single runtime holder (`services/federationState.ts`,
      `federationRunning()`) is seeded once at boot from the effective value and
      is the sole source of truth the running code reads (app mount, queue
      handlers, remote routes, health). The UI shows the running-vs-saved gap and
      a "restart to apply" note — never a silent, half-applied state.
- [x] **Secret rotation (deliberate, restart-applied).** The Instance tab can
      rotate the **auto-managed** session secret (`config.rotateSessionSecret`
      overwrites the persisted `STATE_DIR/session_secret`, mode 0600). It's gated
      behind a confirm dialog that spells out the consequence — it takes effect on
      restart and signs everyone out then. Refused (with an explanatory note) when
      the secret is operator-supplied via `SESSION_SECRET` / `SESSION_SECRET_FILE`
      (`config.sessionSecretManaged`), which must be rotated where it's set.
- Files: `services/instanceSetup.ts` (`setInstanceIdentity`, federation
  accessors), `services/federationState.ts` (new runtime holder), `config.ts`
  (`sessionSecretManaged`, `rotateSessionSecret`), `main.ts` (seed at boot),
  `app.ts` / `queue/handlers.ts` / `routes/remote.ts` / `routes/health.ts`
  (read `federationRunning()`), `routes/admin.ts` (`/instance` GET/PUT +
  `/instance/rotate-secret`); frontend `components/AdminInstanceSettings.svelte`,
  `components/AdminEmail.svelte`, `routes/admin/+page.svelte` (Email + Instance
  tabs), `lib/api`, `lib/types`.

## S5 — Podman parity & upgrades

- [x] **Engine-agnostic compose, Podman documented.** The compose file uses only
      portable constructs (named volumes, standard `depends_on` conditions,
      file-based secrets via a plain volume — not Docker's `secrets:` primitive),
      so it runs unchanged under Docker or Podman. The one host-level difference,
      rootless Podman's inability to bind ports < 1024, is handled by the already
      parameterised `HTTP_PORT` / `HTTPS_PORT` and documented in the README
      (publish on high ports, or lower `ip_unprivileged_port_start`).
- [x] **"Toy" upgrade path confirmed end to end.** Verified in an isolated stack:
      a second `up -d --build` recreates the containers, migrations re-run
      **idempotently** ("already up to date"), and a seeded data marker, the
      generated session secret, and a UI-rotated secret in the `state` volume all
      survive. Data lives only in named volumes (`pgdata` / `uploads` / `state` /
      `secrets` / `caddy_data`), documented as a table in the README; only
      `down -v` removes them.
- [x] **One-liner install** (`install.sh`) — `curl … | sh` detects the engine
      (docker/podman compose variants), fetches the source (git clone, or a GitHub
      tarball when git is absent — needed because the compose builds from source,
      no prebuilt images yet), warns about rootless Podman low ports, and runs
      `up -d --build`. Re-running upgrades in place. README Quick start links it.

---

## Done gate

**"Toy-easy" ships when:** a fresh operator can, with only Docker/Podman
installed and one DNS A record pointed at their host, run a single command,
open the browser, finish the wizard, and have a federating HTTPS instance that
sends working `noreply@` mail — having edited **zero** config files.
