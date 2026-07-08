# Self-hosting Omicron

A complete, beginner-friendly guide to running your own Omicron instance — a
self-hostable, federated (ActivityPub) blogging platform.

The design goal is **toy-easy**: run one command, open your browser, finish a
short wizard. You never edit a config file, generate a secret, or wrangle TLS
certificates by hand. This guide walks the whole path anyway, so you understand
what is happening and can handle the few decisions only you can make (your
domain, and how you want to send email).

If you just want the fastest path: [Quick start](#quick-start). If you want to
understand each piece: read straight through.

---

## Contents

1. [What you get](#what-you-get)
2. [Before you start](#before-you-start)
3. [Quick start](#quick-start)
4. [Going public: your domain + automatic HTTPS](#going-public-your-domain--automatic-https)
5. [The first-run setup wizard](#the-first-run-setup-wizard)
6. [Email setup (the one real decision)](#email-setup-the-one-real-decision)
7. [The admin panel](#the-admin-panel)
8. [Turning on federation](#turning-on-federation)
9. [Configuration reference](#configuration-reference)
10. [Running on Podman](#running-on-podman)
11. [Upgrading](#upgrading)
12. [Backups and restore](#backups-and-restore)
13. [Troubleshooting](#troubleshooting)
14. [Uninstalling](#uninstalling)
15. [Security notes](#security-notes)

---

## What you get

One command brings up the whole stack:

| Piece      | What it does                                                  |
| ---------- | ------------------------------------------------------------- |
| Caddy      | The single public entry point. Terminates TLS, gets Let's Encrypt certificates automatically, routes traffic. |
| Frontend   | The SvelteKit web app (what your readers and writers see).    |
| Backend    | The API + ActivityPub server (Deno).                          |
| Postgres   | The database. All your content lives here.                    |

You do **not** manage any of these individually. Everything is orchestrated by a
single `docker-compose.yml`, and all your data lives in named volumes that
survive restarts and upgrades.

What is automated for you:

- **Secrets** — the database password and session secret are generated on first
  boot. You never invent or type one.
- **HTTPS** — a real Let's Encrypt certificate is fetched the first time someone
  visits your domain over HTTPS. No certbot, no domain typed into any file.
- **Database migrations** — run automatically on startup, and are idempotent
  (safe to re-run).

What only you can decide (and the wizard/admin page walks you through):

- Your **public domain**.
- How to send **email** (password resets and verification).
- Whether to enable **federation** (ActivityPub) or run as a standalone blog.

---

## Before you start

You need three things.

### 1. A machine to run it on

- For **local testing**: any laptop or desktop with Docker works. You will reach
  it at `http://localhost`.
- For a **public instance**: a small VPS (virtual server) from any provider.

The whole stack runs as five small containers (backend, frontend, PostgreSQL,
Redis, Caddy) — everything is bundled, so the only thing you install on the host
is a container engine.

#### Minimum requirements

| Resource | Local test | Standalone blog | Public federated instance |
| --- | --- | --- | --- |
| **CPU** | 1 vCPU | 1 vCPU | 2 vCPU |
| **RAM** | 1 GB | 1 GB | **2 GB** |
| **Disk** | 2 GB free | a few GB (grows with uploads) | 5 GB+ (grows with uploads) |
| **Arch** | amd64 or arm64 | amd64 or arm64 | amd64 or arm64 |
| **Domain** | not needed | optional | **required** |
| **Open ports** | none (localhost) | 80 + 443 | **80 + 443, publicly reachable** |

Notes:

- **Architecture** — all base images are multi-arch, so a cheap ARM VPS works as
  well as x86.
- **1 GB RAM** is enough for standalone or low-traffic use. Because federation
  adds inbound delivery and background jobs, treat **2 GB as the real floor for a
  public federated instance**.
- **Redis is optional.** It ships in the default stack for durable queues and
  shared rate limits, but the app also runs entirely in-process without it — drop
  it to save memory on the smallest boxes (see
  [Configuration reference](#configuration-reference)).
- **No managed database, TLS certificate, or secrets to provision** — Postgres,
  the Let's Encrypt certificate, the session secret, and the database password
  are all bundled or generated automatically on first boot.
- **Federation requires public reachability on port 443** so other ActivityPub
  servers can deliver activities to your inbox.

### 2. A container engine

Either one works — the stack is engine-agnostic:

- **Docker** with the Compose plugin (`docker compose`). Install via
  <https://docs.docker.com/engine/install/>.
- **Podman** 4+ with `podman compose` or `podman-compose`. See
  [Running on Podman](#running-on-podman) for the one difference (binding ports
  below 1024 when rootless).

Verify Docker is ready:

```bash
docker --version
docker compose version
```

### 3. A domain name (only for a public instance)

To federate or to be reachable at a nice URL, you need a domain (e.g.
`blog.example.com`) and the ability to add a DNS record for it. You do **not**
need one to try Omicron locally.

> **Note on ports.** A public instance uses ports **80** and **443**. Make sure
> nothing else on the host is using them (another web server, another Caddy/nginx).
> If they are taken, you can move Omicron to other ports — see
> [Configuration reference](#configuration-reference).

---

## Quick start

### Option A — one command (no git needed)

```bash
curl -fsSL https://raw.githubusercontent.com/the-jk-labs/omicron/main/install.sh | sh
```

The installer detects your container engine (Docker or Podman), downloads the
source, and brings the stack up. When it finishes it prints the URLs and the
upgrade command.

### Option B — clone and run it yourself

```bash
git clone https://github.com/the-jk-labs/omicron.git omicron
cd omicron
docker compose up -d --build
```

The first build compiles the images and can take a few minutes. After that:

- **Local:** open <http://localhost>
- **Public:** see the next section to point your domain here first, then open
  `https://your-domain`.

You will land on the **setup wizard**. The **first account you create becomes the
admin**.

Quick health checks:

```bash
curl localhost:8000/healthz     # -> {"status":"ok"}
curl localhost:8000/version     # -> name, version, federation flag
```

(Those debug ports are bound to `127.0.0.1` only — reachable on the host for
troubleshooting, never exposed to the internet. All public traffic goes through
Caddy on 80/443.)

---

## Going public: your domain + automatic HTTPS

This is the **only** manual infrastructure step, and it is a single DNS record.

1. **Point DNS at your server.** In your domain provider's DNS settings, add a
   record for the hostname you want:

   - `A` record → your server's IPv4 address, or
   - `AAAA` record → your server's IPv6 address.

   Example: `blog.example.com  A  203.0.113.10`

2. **Wait for DNS to propagate** (usually minutes; up to an hour). You can check
   with `dig blog.example.com` or an online DNS checker.

3. **Open `https://your-domain`.** The first visit triggers Caddy to fetch a
   Let's Encrypt certificate **on demand**, automatically. No certbot, no
   certificate files, no renewal cron — Caddy handles issuance and renewal, and
   the certificate is stored in the `caddy_data` volume so upgrades keep it.

That's it. You will see the setup wizard, served securely over your domain.

> **How the domain is learned.** You don't have to put your domain in a config
> file. Caddy learns the hostname from the incoming request and asks the backend
> whether it's allowed to get a certificate for it. Once you finish the wizard,
> only your saved domain (and its `www.` alias) is ever issued a certificate, so
> a stray hostname pointed at your server can't trigger unbounded requests.

If you set your domain during the wizard, you're done. You can also set
`APP_DOMAIN` up front (see [Configuration reference](#configuration-reference)),
but it isn't required.

---

## The first-run setup wizard

The wizard appears on first launch and every route redirects to it until it's
finished. It has three short steps.

1. **Instance identity** — your instance's public **name** and **domain**. The
   name shows across the site; the domain is used for links in email, share
   cards, and (if you enable it) your fediverse identity.

2. **Admin account** — create the first user. This account is **automatically the
   administrator** and is signed in immediately. It is auto-verified, so you can
   proceed even before email is configured.

3. **Email** — choose how the instance sends mail (password resets and
   verification). You can pick the zero-setup `console` mode now and configure
   real email later from the admin page. There is a **"send test email"** button
   so you can confirm delivery before finishing. See the next section for how to
   choose.

After you finish, the wizard never shows again (it's guarded so it can't run once
an admin exists), and you're dropped into your live instance.

Everything the wizard sets is editable later in the [admin panel](#the-admin-panel),
so nothing here is permanent — you never have to reinstall to change your mind.

---

## Email setup (the one real decision)

Omicron sends two kinds of transactional email: **password resets** and **email
verification**. You configure this entirely from the web (wizard or admin page) —
no editing files — and there's a **live test button** at every step.

There are four modes. Pick based on how much deliverability you need.

### `console` — no email, just logs (default)

The message and its link are printed to the backend's logs instead of being sent.
Perfect for local testing or a small single-user instance where you don't need
real mail. View them with:

```bash
docker compose logs -f backend
```

### `smtp` — use any mail server or provider (easiest real email)

Paste the host, port, username, and password of an SMTP server — either your own,
or a provider's SMTP endpoint (SendGrid, Mailgun, Postmark, Brevo, Resend, Gmail,
etc.). The admin page has **presets** that fill in host/port/TLS for common
providers; you just add your key. This is the simplest path to reliable email and
avoids the port-25 and DNS headaches below.

- Port **587** uses STARTTLS (the common case).
- Port **465** uses implicit TLS (toggle "implicit TLS" on).

### `relay` — one API key, no SMTP (Path A)

Send through a provider's HTTP API instead of SMTP. Today this supports **Resend**:
paste a single API key and you're done. Nothing else to configure.

### `direct` — self-hosted delivery with DKIM (Path B, advanced)

The instance delivers mail straight to each recipient's mail server and
cryptographically signs it (DKIM). This needs no third party, but real-world
deliverability depends on things only your host and DNS can provide:

1. **Outbound port 25 must be open.** Most VPS providers **block** it by default
   to fight spam. The admin page has a **"Check port 25"** button that tests this
   from inside the container. If it's blocked, use `smtp` or `relay` instead.
2. **Publish DNS records.** The admin page **generates an RSA-2048 DKIM keypair**
   (the private key never leaves your server) and shows you the exact **SPF**,
   **DKIM**, and **DMARC** records to add at your DNS provider, with copy buttons.
   It then **verifies them live** over DNS before declaring email healthy.
3. **Set reverse DNS (PTR).** At your VPS provider, set the PTR record for your
   server's IP to your mail hostname (forward-confirmed). This is the most
   commonly missed step and mail from fresh IPs is often spam-filtered without it.

> **Recommendation.** For most people, `relay` (one API key) or `smtp` (a
> provider's endpoint) is the least-friction path to email that actually lands in
> inboxes. Reach for `direct` only if you specifically want no third party and
> your host allows port 25.

### The default sender address

By default the "From" address is derived from your domain as
`Your Instance <noreply@your-domain>`. You can override it in the settings.

---

## The admin panel

Sign in as the admin and open **`/admin`**. Everything the wizard set — and more —
is editable here, so you never return to a config file. Tabs:

- **Instance** — your instance **name** and **public domain**, the **federation**
  toggle, and **session-secret rotation**. (Domain and federation changes apply on
  the next restart; the page tells you when a restart is needed.)
- **Email** — switch modes, edit connection details (passwords are write-only and
  shown as "unchanged"), generate DKIM keys, verify DNS, and **send a live test**.
- **Reports** — the moderation queue: review user-reported posts and actors,
  remove posts, and dismiss reports.
- **Users** — suspend or reinstate local accounts.
- **Federation** — defederate (block) a domain, or re-federate it. Blocking
  purges already-cached content from that domain.
- **Security** — the **AI-scraper shield** (see below).

### AI-scraper protection

Under **Security → AI-scraper protection** you can switch on a lightweight
proof-of-work challenge ([Anubis](https://anubis.techaro.lol)) for page loads.
It's **off by default** — leave it off unless AI crawlers are actually hammering
your instance, because it adds a ~1-second interstitial for every reader
(including no-JS visitors).

When you flip it on, browser-like traffic to your pages gets challenged; real
browsers solve it in about a second, most scrapers can't. **Federation and the
API are never challenged**, so ActivityPub delivery, RSS/feeds, and API clients
keep working untouched. The toggle applies **live** — no restart, no config
files: the backend re-routes the app through the bundled challenge service via
Caddy's internal admin API. Link-preview cards still work (OpenGraph crawlers are
let through), and per-IP rate limiting stays accurate.

The challenge service always runs but only sits in the request path while the
toggle is on. Its signing key is in-memory, so a stack restart re-challenges
readers once — a harmless one-time solve.

### Rotating the session secret

Under **Instance → Session secret** you can rotate the secret that signs login
sessions. Use this only if you suspect it was exposed — it **signs everyone out**
(including you) on the next restart. It's guarded by a confirmation dialog. If you
pinned the secret yourself via the `SESSION_SECRET` environment variable, the UI
tells you to rotate it there instead.

---

## Turning on federation

Federation (ActivityPub) is **off by default**, so a fresh instance is a private,
standalone blog. Turning it on lets your posts appear across the fediverse and
lets people on Mastodon and other servers follow your writers.

Federation binds your server's identity to your **domain at startup**, so the
order matters:

1. Set your **public domain** first (wizard or **Instance** tab) and make sure
   HTTPS works at `https://your-domain`. Federation effectively requires HTTPS.
2. Turn on the **Federation** toggle in the **Instance** tab (or set
   `FEDERATION_ENABLED=true`).
3. **Restart** so the change takes effect:

   ```bash
   docker compose up -d
   ```

You can confirm it's active two ways: on the server, `curl localhost:8000/version`
shows `"federation": true`; publicly, `curl https://your-domain/.well-known/nodeinfo`
returns JSON (a 404 there means federation is still off). The backend also logs
`Federation enabled (ActivityPub)` on boot.

---

## Configuration reference

You normally need **no configuration** — `docker compose up -d --build` works with
no `.env` file at all. Create a `.env` next to `docker-compose.yml` **only** to
override a default. Every variable is optional; anything you leave out keeps its
built-in default. Web settings (wizard/admin) take precedence over env values.

| Variable                | Default             | Purpose                                                       |
| ----------------------- | ------------------- | ------------------------------------------------------------- |
| `APP_DOMAIN`            | `localhost:5173`    | Public domain (no scheme). Usually set via the wizard.        |
| `PUBLIC_APP_NAME`       | `Omicron`           | Instance name shown in the UI.                                |
| `FEDERATION_ENABLED`    | `false`             | `true` enables ActivityPub. Applied on restart.               |
| `HTTP_PORT`             | `80`                | Host HTTP port for Caddy. Change if 80 is taken.              |
| `HTTPS_PORT`            | `443`               | Host HTTPS port for Caddy. Change if 443 is taken.            |
| `SESSION_SECRET`        | *(auto-generated)*  | Only set to pin your own. `openssl rand -hex 32`.             |
| `DATABASE_URL`          | *(bundled Postgres)*| Point at an **external** Postgres instead of the bundled one. |
| `POSTGRES_USER` / `_DB` | `omicron`           | Names for the bundled database (password is generated).       |
| `EMAIL_*`               | `console`           | Email fallback defaults; normally set in the web UI instead.  |
| `RATE_LIMIT_ENABLED`    | `true`              | Leave on unless a trusted upstream already throttles.         |
| `EMAIL_VERIFICATION_REQUIRED` | `false`       | Require email confirmation before sign-in (invite/closed instances). |

See [.env.example](.env.example) for the full annotated list, including
rate-limit tuning and storage paths.

### Example: run on non-standard ports

If 80/443 are in use, put Omicron on other ports (then browse to
`http://your-host:8080`):

```bash
# .env
HTTP_PORT=8080
HTTPS_PORT=8443
```

Note that automatic Let's Encrypt HTTPS on a custom port is not standard; for a
real public instance, prefer freeing up 80/443.

---

## Running on Podman

The stack runs unchanged under Podman — just substitute the command:

```bash
podman compose up -d --build      # or: podman-compose up -d --build
```

The one difference is **rootless Podman cannot bind ports below 1024** (like 80
and 443) by default. Two ways around it:

- **Publish on high ports** (already parameterized):

  ```bash
  HTTP_PORT=8080 HTTPS_PORT=8443 podman compose up -d --build
  # then browse http://localhost:8080
  ```

- **Or allow low ports once** on the host:

  ```bash
  sudo sysctl net.ipv4.ip_unprivileged_port_start=80
  ```

Everything else — generated secrets, named volumes, on-demand HTTPS — behaves
identically.

---

## Upgrading

```bash
git pull
docker compose up -d --build      # or the equivalent podman command
```

(If you installed with the one-liner, re-running it does the same thing.)

- Database **migrations run automatically** on startup and are idempotent (a
  no-op when already current).
- A rebuild recreates the **containers** but never the **volumes**, so your data,
  secrets, and TLS certificates are preserved.
- Schema changes are **additive within a version** by policy, so upgrades don't
  break a running instance.

### One-time step when upgrading to the AI-scraper-shield release

This version changes the bundled **Caddyfile** (to open an internal admin API the
scraper-shield toggle uses). Caddy only reads that file at startup, and a plain
`up -d` doesn't recreate an unchanged service, so **recreate the containers once**
on this upgrade:

```bash
docker compose up -d --build --force-recreate   # or the podman equivalent
```

This recreates the containers (loading the new Caddyfile and starting the new
Anubis service) but **never the volumes**, so all data and certificates are
preserved. If you skip it, nothing breaks — the instance runs normally and
protection stays off (the default); you just can't switch it on in Admin →
Security until Caddy has been recreated. After this one release, normal `up -d`
upgrades resume.

Always take a backup before a major upgrade (next section). Only
`docker compose down -v` deletes your data volumes — **never run that on a live
instance you want to keep.**

---

## Backups and restore

All state lives in named volumes: `pgdata` (database), `uploads` (media),
`secrets` (generated DB password + session secret), `state` (a rotated session
secret, if any), and `caddy_data` (TLS certs). A backup must be **self-consistent**:
the database and the `secrets` password it was created with belong together.

The `redis_data` volume is deliberately **not** in the backups below: it holds
only transient queue state (pending jobs and in-flight federation deliveries),
which Redis re-drains after a restart. It's safe to let it start empty on
restore — no durable content lives there.

There are two verified strategies (both round-trip-tested). Commands assume the
default project name `omicron`, so volumes are `omicron_pgdata`, etc.

### Method A — logical dump (portable, recommended)

Portable across Postgres versions and safe to run live. On restore, the instance
generates a fresh password and session secret (so `secrets` is **not** backed up),
which signs everyone out once — expected for a restore/migration.

```bash
# Back up
docker compose exec -T postgres \
  pg_dump -U omicron -Fc omicron > omicron-db-$(date +%F).dump
for v in uploads caddy_data; do
  docker run --rm -v omicron_$v:/v:ro -v "$PWD":/backup alpine:3 \
    tar czf /backup/omicron-$v-$(date +%F).tgz -C /v .
done
```

```bash
# Restore onto a fresh host (empty volumes)
docker compose up -d postgres
sleep 5
docker compose exec -T postgres \
  pg_restore -U omicron -d omicron --clean --if-exists < omicron-db-YYYY-MM-DD.dump
for v in uploads caddy_data; do
  docker run --rm -v omicron_$v:/v -v "$PWD":/backup alpine:3 \
    sh -c "rm -rf /v/* && tar xzf /backup/omicron-$v-YYYY-MM-DD.tgz -C /v"
done
docker compose up -d
```

Do **not** restore an old `secrets` tarball here — its password won't match the
freshly initialized database and the backend won't connect.

### Method B — full volume snapshot (simple, version-locked)

Copies every volume as-is, so the database and its matching password stay
consistent and **sessions survive**. Tied to the same Postgres major version; stop
the stack first so the database files are copied at rest.

```bash
# Back up
docker compose stop
for v in pgdata uploads state secrets caddy_data; do
  docker run --rm -v omicron_$v:/v:ro -v "$PWD":/backup alpine:3 \
    tar czf /backup/omicron-$v-$(date +%F).tgz -C /v .
done
docker compose start
```

```bash
# Restore onto a fresh host, then bring the stack up
for v in pgdata uploads state secrets caddy_data; do
  docker run --rm -v omicron_$v:/v -v "$PWD":/backup alpine:3 \
    sh -c "tar xzf /backup/omicron-$v-YYYY-MM-DD.tgz -C /v"
done
docker compose up -d
```

Restore the **whole set** or none of it — a partial mix breaks the
database↔password pairing.

The full write-up (including the reasoning behind the pairing) is in the
[README](README.md#backups--restore).

---

## Troubleshooting

**The first `up` takes a long time / seems stuck.**
The first build compiles the images (a few minutes). Watch progress with
`docker compose logs -f`.

**I can't reach the site.**
- Local: use `http://localhost` (not HTTPS). The app is also directly at
  `http://localhost:5173` for debugging.
- Public: confirm your DNS `A`/`AAAA` record points at the server, and that ports
  80 and 443 are open in the host/provider firewall.

**HTTPS certificate isn't being issued.**
- DNS must resolve to this server first, and ports 80/443 must be reachable from
  the internet (Let's Encrypt validates over them).
- `localhost` never gets a certificate — that's expected; it's served over plain
  HTTP for local dev.
- Check `docker compose logs -f caddy` for the ACME error.

**"Port 25 is blocked" when setting up direct email.**
Expected on most hosts (and always on localhost). Use the `smtp` or `relay` email
mode instead, or ask your provider to unblock port 25 and set reverse DNS (PTR).

**Test email fails.**
The error is shown verbatim. Common causes: wrong SMTP password, wrong port/TLS
combination (587 = STARTTLS, 465 = implicit TLS), or provider requiring a verified
sender. Fix and press "send test" again.

**Federation toggle didn't take effect.**
It applies on restart. Run `docker compose up -d`, then check (on the server)
`curl localhost:8000/version` for `"federation": true`.

**Ports 80/443 already in use.**
Set `HTTP_PORT` / `HTTPS_PORT` in `.env` to free ports, or stop the conflicting
service.

**Check what's running / read logs.**

```bash
docker compose ps
docker compose logs -f backend      # or: caddy, frontend, postgres
```

---

## Uninstalling

Stop the stack but **keep your data**:

```bash
docker compose down
```

Remove the containers **and delete all data** (irreversible — database, uploads,
secrets, certificates):

```bash
docker compose down -v
```

---

## Security notes

- **Debug ports are loopback-only.** The backend (`:8000`) and frontend (`:5173`)
  are published on `127.0.0.1` for local troubleshooting. All public traffic goes
  through Caddy on 80/443 over TLS. Don't change those mappings to `0.0.0.0` on a
  public host — that would expose the API without TLS.
- **Keep secrets secret.** The generated database password and session secret live
  in the `secrets` volume. Your backups contain them (Method B) or a session
  secret is regenerated (Method A) — store backups somewhere private.
- **Rate limiting is on by default** for logins, registrations, API writes, and
  the federation inbox. Leave it on unless a trusted upstream already throttles.
- **Keep your instance updated** — pull and rebuild regularly for security fixes.
- **Back up before upgrades**, and test that your backups actually restore.

---

Questions, bugs, or want to contribute? See the project
[README](README.md) and [ROADMAP](ROADMAP.md).
