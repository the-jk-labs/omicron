<p align="center">
  <img src="assets/logo.png" alt="Omicron" width="120" />
</p>

<h1 align="center">Omicron</h1>

<p align="center">
  <strong>A home for free expression on the fediverse</strong><br />
  Minimal, modern, self-hostable blogging over ActivityPub.
</p>

<p align="center">
  <a href="https://github.com/the-jk-labs/omicron/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/the-jk-labs/omicron/ci.yml?branch=main&style=flat-square&label=CI" alt="CI" /></a>
  <a href="https://github.com/the-jk-labs/omicron/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square" alt="License: AGPL-3.0" /></a>
  <a href="https://docs.omicron.blog/federation/overview/"><img src="https://img.shields.io/badge/protocol-ActivityPub-6364FF?style=flat-square" alt="ActivityPub" /></a>
  <a href="https://github.com/the-jk-labs/omicron/commits/main"><img src="https://img.shields.io/github/last-commit/the-jk-labs/omicron?style=flat-square" alt="Last commit" /></a>
  <a href="https://github.com/the-jk-labs/omicron/stargazers"><img src="https://img.shields.io/github/stars/the-jk-labs/omicron?style=flat-square" alt="GitHub stars" /></a>
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#stack">Stack</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#documentation">Documentation</a> ·
  <a href="#development">Development</a> ·
  <a href="#publishing-from-an-external-cms">External CMS</a> ·
  <a href="#contributing">Contributing</a> ·
  <a href="#security">Security</a> ·
  <a href="#license">License</a>
</p>

Omicron is a federated blogging platform. Write rich-text posts, follow other
writers, read a personalized feed, and federate with the wider fediverse over
**ActivityPub** — with no vendor lock-in and no gatekeepers. Run your own
instance in one command and own your words.

## Features

- **Federated** — every user is an ActivityPub actor; follow and be followed
  across the fediverse.
- **Minimal & modern** — a clean, distraction-free reading and writing
  experience built on a small, readable codebase.
- **Free expression** — your instance, your rules, your data.
- **Self-hostable** — Docker-first, one command, auto-migrating, seamless
  upgrades.
- **Real writing tools** — a Tiptap editor with full Markdown support.

## Stack

| Layer    | Technology                                            |
| -------- | ----------------------------------------------------- |
| Backend  | Deno · Hono · Fedify · Drizzle · PostgreSQL · Redis   |
| Frontend | SvelteKit · bits-ui · Tiptap · TailwindCSS            |
| Mobile   | Kotlin Multiplatform · Compose                        |
| Deploy   | Docker Compose · Caddy (TLS) · Anubis · restic backup |

---

## Quick start

One command, no git needed — fetches the source and brings the stack up:

```bash
curl -fsSL https://raw.githubusercontent.com/the-jk-labs/omicron/main/install.sh | sh
```

No config to edit — the session secret and database password are generated
automatically on first boot. Open <http://localhost> and finish the short setup
wizard. **The first account you create becomes the admin.**

To go public, point an `A`/`AAAA` record at the host and open
`https://your-domain` — the bundled Caddy fetches a Let's Encrypt certificate on
demand.

Full walkthrough: **[docs.omicron.blog/quick-start](https://docs.omicron.blog/quick-start/)**

## Documentation

Everything lives at **[docs.omicron.blog](https://docs.omicron.blog)**:

- [Self-hosting](https://docs.omicron.blog/self-hosting/installation/) — install,
  domain and HTTPS, email, admin panel, Podman, upgrades, backups,
  troubleshooting
- [Using Omicron](https://docs.omicron.blog/using/writing/) — writing, profiles,
  reading, lists, moderation, writer dashboard
- [Federation](https://docs.omicron.blog/federation/overview/) — how it works,
  endpoints, delivery, compatibility
- [Development](https://docs.omicron.blog/development/architecture/) —
  architecture, local setup, backend and frontend guides, migrations,
  contributing
- [Reference](https://docs.omicron.blog/reference/environment/) — environment
  variables, HTTP and admin APIs, rate limits

## Development

```bash
# Postgres must be running and DATABASE_URL set.
cd apps/backend && pnpm install && pnpm dev   # http://localhost:8000
cd apps/frontend && pnpm install && pnpm dev  # http://localhost:5173
```

Development uses pnpm throughout; Deno runs the backend underneath
(`pnpm dev` starts it) and in the production container.

The frontend typecheck reads the backend's serializers
(`apps/frontend/src/lib/api/contract.ts`), so install the backend's
dependencies before running the frontend's `pnpm check`.

### Tests

```bash
cd apps/backend
pnpm test:unit         # no database needed
pnpm test:integration  # needs Postgres, see below
pnpm check             # typecheck, format, lint and unit tests (run `pnpm fmt` first)
```

The integration suite runs the committed migrations and **truncates every
table it touches** — point it at a scratch database, never a real one. It
defaults to `postgres://omicron:omicron@localhost:5432/omicron_test` (see
`apps/backend/tests/test.env`); override with `DATABASE_URL`.

See the [local setup guide](https://docs.omicron.blog/development/local-setup/)
for the full picture, including Node 26+, the test database, and CI.

## Publishing from an external CMS

Any writer can publish from an external system — Sanity, Contentful, a
static-site build hook, a script. Mint a token under **Settings →
Integrations** and POST Markdown to `/api/webhooks/content`. Posts publish
under your name and federate like anything written in the editor.

```bash
curl -X POST https://your-domain/api/webhooks/content \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $OMICRON_TOKEN" \
  -d '{
    "title": "Europe is ditching Visa and Mastercard",
    "body": "## The short version\n\nIt is a **huge** step.",
    "slug": "eu-payments",
    "tags": ["fintech", "europe"]
  }'
# → 201 {"id":"…","slug":"eu-payments","status":"published","created":true}
```

Only `title` and `body` (Markdown) are required. Re-POST the same `slug` to
update the post instead of duplicating it; send partial fields to change only
what you list, or `null` to clear a field. The token also works as
`Authorization: Bearer <token>`.

Full reference:
**[docs.omicron.blog/reference/content-webhook](https://docs.omicron.blog/reference/content-webhook/)**

## Contributing

Pull requests are welcome. For architecture, local setup, migrations, and
conventions, start with the
[development docs](https://docs.omicron.blog/development/architecture/).
Run `pnpm fmt` then `pnpm check` in every app you touched before pushing, and
open a PR against `main` — never push to it directly.

## Security

Report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## License

Omicron is free software licensed under the **GNU Affero General Public License
v3.0 or later** (AGPL-3.0-or-later). See [LICENSE](LICENSE) for the full text.

If you run a modified version as a network service, the AGPL's §13 requires
offering users your modified source. The app surfaces a "Source" link for this
— point it at your fork if you deploy changes.
