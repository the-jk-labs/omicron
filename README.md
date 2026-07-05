<p align="center">
  <img src="assets/logo.png" alt="Omicron" width="120" />
</p>

<h1 align="center">Omicron</h1>

<p align="center">
  <strong>A home for free expression on the fediverse</strong><br />
  Minimal, modern, self-hostable blogging over ActivityPub.
</p>

<p align="center">
  <img src="https://shieldcn.dev/badge/license-AGPL--3.0-blue.svg?logo=opensourceinitiative&size=xs" alt="License: AGPL-3.0" />
  <img src="https://shieldcn.dev/badge/protocol-ActivityPub-6364FF.svg?logo=activitypub&size=xs" alt="ActivityPub" />
  <img src="https://shieldcn.dev/badge/backend-Deno-000000.svg?logo=deno&logoColor=white&size=xs" alt="Deno" />
  <img src="https://shieldcn.dev/badge/frontend-SvelteKit-FF3E00.svg?logo=svelte&logoColor=white&size=xs" alt="SvelteKit" />
</p>

Omicron is a federated blogging platform. Write rich-text posts, follow other
writers, read a personalized feed, and federate with the wider fediverse over **ActivityPub** — with no vendor
lock-in and no gatekeepers. Run your own instance in one command and own your
words.

### Why Omicron

- **Federated** — every user is an ActivityPub actor; follow and be followed
  across the fediverse.
- **Minimal & modern** — a clean, distraction-free reading and writing
  experience built on a small, readable codebase.
- **Free expression** — your instance, your rules, your data.
- **Self-hostable** — Docker-first, one command, auto-migrating, seamless
  upgrades.
- **Real writing tools** — a Tiptap editor with full Markdown support.

**Stack** — Backend: Deno · Hono · Fedify · Drizzle · PostgreSQL · Frontend:
SvelteKit · bits-ui · Tiptap · TailwindCSS.

---

## Quick start

> New to self-hosting? The **[Self-hosting guide](selfhost.md)** walks the whole
> path step by step — domain + HTTPS, email, the admin panel, upgrades, and
> backups — in plain language.

One command, no git needed — fetches the source and brings the stack up:

```bash
curl -fsSL https://raw.githubusercontent.com/the-jk-labs/omicron/main/install.sh | sh
```

Or clone and run it yourself:

```bash
git clone https://github.com/the-jk-labs/omicron.git omicron
cd omicron
docker compose up -d --build
```

No config to edit — the session secret and database password are generated
automatically on first boot. Open <http://localhost> (or
<http://localhost:5173> for the app directly) and finish the short setup wizard.
**The first account you create becomes the admin.**

### Docker or Podman

The stack is engine-agnostic — anything that speaks Compose works. The installer
auto-detects `docker compose`, `docker-compose`, `podman compose`, or
`podman-compose`. To drive Podman by hand, swap the command:

```bash
podman compose up -d --build      # or: podman-compose up -d --build
```

**Rootless Podman** can't bind ports below 1024 by default. Either publish the
stack on high ports (it's already parameterised):

```bash
HTTP_PORT=8080 HTTPS_PORT=8443 podman compose up -d --build   # browse http://localhost:8080
```

or allow low ports once: `sudo sysctl net.ipv4.ip_unprivileged_port_start=80`.
Everything else (named volumes, generated secrets, on-demand HTTPS) behaves the
same under either engine.

| Service  | URL                     | Notes                                   |
| -------- | ----------------------- | --------------------------------------- |
| Caddy    | http://localhost        | Public entrypoint (HTTPS in production) |
| Frontend | http://localhost:5173   | The app UI (direct, for debugging)      |
| Backend  | http://localhost:8000   | JSON API + ActivityPub endpoints        |
| Postgres | (internal)              | Data persisted in the `pgdata` volume   |

Health checks: `curl localhost:8000/healthz` and `curl localhost:8000/version`.

### Going public (HTTPS on your domain)

The **only** manual step is DNS: point an `A`/`AAAA` record for your domain at
this host. Then open `https://your-domain` — the bundled Caddy fetches a Let's
Encrypt certificate on demand (no certbot, no domain in any config file) and the
setup wizard runs over HTTPS. Certificates persist in the `caddy_data` volume,
so upgrades keep them. If ports 80/443 are already used on the host, set
`HTTP_PORT` / `HTTPS_PORT` (see [.env.example](.env.example)).

---

## Upgrading an instance

```bash
git pull
docker compose up -d --build      # or the equivalent podman command
```

Database migrations **run automatically on backend startup** and are idempotent
(a no-op when already current). Nothing you care about lives in a container:

| Volume        | Holds                                              |
| ------------- | -------------------------------------------------- |
| `pgdata`      | All Postgres data (accounts, posts, follows)       |
| `uploads`     | User-uploaded media (avatars)                      |
| `secrets`     | Generated DB password + bootstrap session secret   |
| `state`       | App-managed state (e.g. a UI-rotated session secret) |
| `redis_data`  | Queued jobs + pending federation deliveries (Redis) |
| `caddy_data`  | Let's Encrypt certificates                          |

A rebuild recreates the containers but never the volumes, so upgrades keep your
data, secrets, and certificates. (Only `docker compose down -v` deletes volumes —
don't run that on a live instance.)

### Migration policy (backward-compatible by rule)

Upgrades must never break a running instance, so schema changes are **additive
only** within a version:

1. **Add** new columns/tables (nullable or with defaults) and migrate data.
2. Ship code that works with **both** old and new shapes.
3. **Remove** old columns only in a later major release.

Migrations are versioned SQL in [`apps/backend/drizzle/`](apps/backend/drizzle/)
and replayed at runtime by [`src/db/migrate.ts`](apps/backend/src/db/migrate.ts)
— `drizzle-kit` is **not** required inside the container. The app version lives
in [`apps/backend/src/version.ts`](apps/backend/src/version.ts) and is logged on
boot and exposed at `GET /version`.

To create a new migration during development:

```bash
cd apps/backend
# edit src/db/schema.ts, then:
deno task db:generate     # writes new SQL into ./drizzle (commit it)
```

---

## Backups & restore

All state lives in the named volumes listed above; nothing important is inside a
container image. There are two coherent strategies — pick one, don't mix them.
The catch is that `secrets/db_password` is bound to whatever `pgdata` was created
with, so the database and that password must always travel **together**.

Commands assume the default Compose project name `omicron` (the directory name),
so volumes are `omicron_pgdata`, `omicron_uploads`, etc. Swap the prefix if you
run with `-p <name>`. Both methods below are verified end to end (seed → back up
→ destroy → restore → data intact). Everything works the same under `podman` —
substitute the command.

### Method A — logical dump (portable, recommended)

Portable across Postgres major versions and safe to run on a live instance. On
restore the instance generates a **fresh** DB password and session secret (so
`secrets` is *not* backed up), which means everyone is signed out once — expected
for a restore/migration.

```bash
# Back up: SQL dump + the two file volumes that hold real content.
docker compose exec -T postgres \
  pg_dump -U omicron -Fc omicron > omicron-db-$(date +%F).dump
for v in uploads caddy_data; do
  docker run --rm -v omicron_$v:/v:ro -v "$PWD":/backup alpine:3 \
    tar czf /backup/omicron-$v-$(date +%F).tgz -C /v .
done
```

```bash
# Restore onto a fresh host (empty volumes):
docker compose up -d postgres            # regenerates secrets, inits an empty DB
sleep 5
docker compose exec -T postgres \
  pg_restore -U omicron -d omicron --clean --if-exists < omicron-db-YYYY-MM-DD.dump
for v in uploads caddy_data; do
  docker run --rm -v omicron_$v:/v -v "$PWD":/backup alpine:3 \
    sh -c "rm -rf /v/* && tar xzf /backup/omicron-$v-YYYY-MM-DD.tgz -C /v"
done
docker compose up -d
```

Do **not** restore an old `secrets` tarball here — its `db_password` won't match
the freshly-initialised `pgdata` and the backend won't connect. `caddy_data`
(TLS certs) is optional; skipping it just re-issues certificates on first
request.

### Method B — full volume snapshot (simple, version-locked)

Copies every volume as-is, so `pgdata` and its matching `secrets` stay
consistent and **sessions survive**. Tied to the same Postgres major version, and
you must stop the stack first so the database files are copied at rest.

```bash
# Back up: stop, then tar ALL stateful volumes together.
docker compose stop
for v in pgdata uploads state secrets caddy_data; do
  docker run --rm -v omicron_$v:/v:ro -v "$PWD":/backup alpine:3 \
    tar czf /backup/omicron-$v-$(date +%F).tgz -C /v .
done
docker compose start
```

```bash
# Restore onto a fresh host (empty volumes), then bring the stack up:
for v in pgdata uploads state secrets caddy_data; do
  docker run --rm -v omicron_$v:/v -v "$PWD":/backup alpine:3 \
    sh -c "tar xzf /backup/omicron-$v-YYYY-MM-DD.tgz -C /v"
done
docker compose up -d
```

Restore the **whole set** or none of it — a partial mix (e.g. new `pgdata` with
old `secrets`) breaks the password pairing.

> **What each volume holds:** `pgdata` = all database content, `uploads` = user
> media, `secrets` = generated DB password + bootstrap session secret, `state` =
> a UI-rotated session secret (overrides the bootstrap one), `caddy_data` = Let's
> Encrypt certs.

---

## Configuration (`.env`)

| Variable             | Purpose                                                        |
| -------------------- | -------------------------------------------------------------- |
| `DATABASE_URL`       | Postgres connection string                                     |
| `APP_DOMAIN`         | Public domain (no scheme) — your fediverse identity            |
| `FEDERATION_ENABLED` | `true` to enable ActivityPub; `false` for a standalone blog    |
| `SESSION_SECRET`     | Long random secret (`openssl rand -hex 32`)                    |
| `INTERNAL_API_URL`   | How the frontend reaches the backend (docker service name)     |
| `PUBLIC_APP_NAME`    | Instance name shown in the UI                                  |

---

## Architecture

Clean, layered, minimal-abstraction. **Layers never mix.**

```
apps/backend (Deno)
  routes/        HTTP layer only (Hono) — parse, call a service, serialize
  services/      business logic — no HTTP, no SQL
  db/            Drizzle schema + repositories (the ONLY place SQL runs)
  federation/    ActivityPub (Fedify) — fully isolated, loaded only when enabled
  queue/         queue.add(name, payload) abstraction (in-process now, swappable)

apps/frontend (SvelteKit)
  routes/                 pages (SSR) + /api/[...path] reverse-proxy to backend
  lib/api/                typed API client (same-origin → no CORS, cookies flow)
  lib/components/         UI; Icon.svelte is the single Lucide wrapper
  lib/components/ui/      bits-ui (headless) wrappers
  lib/editor/             Tiptap integration (lazy-loaded on /compose)
```

### Design notes

- **Repository pattern:** all DB access goes through `db/repositories/*`. Routes
  and services never touch Drizzle directly.
- **Cursor pagination everywhere** (keyset on `(created_at, id)`), never `OFFSET`.
- **Sessions** are server-side (Postgres `sessions` table) with an httpOnly
  cookie — the app stays stateless; all state is in Postgres.
- **Queue-ready:** `queue.add("federate_post", …)` runs in-process today but the
  call sites and signatures match a future Redis/broker backend — one file to swap.
- **Federation isolation:** the whole `federation/` tree and Fedify are only
  imported when `FEDERATION_ENABLED=true`, so a standalone blog carries no
  ActivityPub code paths.

---

## Federation

With `FEDERATION_ENABLED=true` and a real public `APP_DOMAIN`, each user is an
ActivityPub actor:

- WebFinger: `GET /.well-known/webfinger?resource=acct:alice@your.domain`
- Actor:     `GET /users/alice`
- Inbox/Outbox: `/users/alice/inbox`, `/users/alice/outbox`

Inbound `Follow`s are auto-accepted; new posts are delivered to remote followers
as `Create(Note)` via the queue. Fedify handles HTTP signatures and delivery
retries.

---

## Development (without Docker)

```bash
# Postgres must be running and DATABASE_URL set.
cd apps/backend && deno task dev      # http://localhost:8000
cd apps/frontend && npm install && npm run dev   # http://localhost:5173
```

Useful checks: `deno task check && deno lint` (backend), `npm run check` (frontend).

---

## License

Omicron is free software licensed under the **GNU Affero General Public License
v3.0 or later** (AGPL-3.0-or-later). See [LICENSE](LICENSE) for the full text.

Because Omicron is typically run as a network service, the AGPL's §13 applies:
if you run a modified version on a server and let users interact with it over a
network, you must offer those users the corresponding source code of your
modified version. The app surfaces a "Source" link in the UI for this purpose —
point it at your fork if you deploy changes.
