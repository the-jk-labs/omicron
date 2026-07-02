<p align="center">
  <img src="assets/logo.png" alt="Omicron" width="120" />
</p>

<h1 align="center">Omicron</h1>

<p align="center">
  <strong>A home for free expression on the fediverse</strong><br />
  Minimal, modern, self-hostable blogging over ActivityPub.
</p>

<p align="center">
  <img src="https://shieldcn.dev/badge/license-AGPL--3.0-blue.svg?logo=opensourceinitiative" alt="License: AGPL-3.0" />
  <img src="https://shieldcn.dev/badge/protocol-ActivityPub-6364FF.svg?logo=activitypub" alt="ActivityPub" />
  <img src="https://shieldcn.dev/badge/backend-Deno-000000.svg?logo=deno&logoColor=white" alt="Deno" />
  <img src="https://shieldcn.dev/badge/frontend-SvelteKit-FF3E00.svg?logo=svelte&logoColor=white" alt="SvelteKit" />
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

```bash
git clone https://github.com/the-jk-labs/omicron.git omicron
cd omicron
cp .env.example .env        # edit SESSION_SECRET and APP_DOMAIN
docker compose up -d --build
```

Open <http://localhost:5173>. **The first account you register becomes the admin.**

| Service  | URL                     | Notes                                  |
| -------- | ----------------------- | -------------------------------------- |
| Frontend | http://localhost:5173   | The app UI                             |
| Backend  | http://localhost:8000   | JSON API + ActivityPub endpoints       |
| Postgres | (internal)              | Data persisted in the `pgdata` volume  |

Health checks: `curl localhost:8000/healthz` and `curl localhost:8000/version`.

---

## Upgrading an instance

```bash
git pull
docker compose up -d --build
```

Database migrations **run automatically on backend startup**. Your data lives in
the `pgdata` Postgres volume and is never touched by a rebuild.

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
