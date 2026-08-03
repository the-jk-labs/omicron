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

<p align="center">
  <a href="https://docs.omicron.blog"><strong>Documentation →</strong></a>
</p>

Omicron is a federated blogging platform. Write rich-text posts, follow other
writers, read a personalized feed, and federate with the wider fediverse over
**ActivityPub** — with no vendor lock-in and no gatekeepers. Run your own
instance in one command and own your words.

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

Full walkthrough: **[docs.omicron.blog/quick-start](https://docs.omicron.blog/quick-start)**

## Documentation

Everything lives at **[docs.omicron.blog](https://docs.omicron.blog)**:

- [Self-hosting](https://docs.omicron.blog/self-hosting/installation) — install,
  domain and HTTPS, email, admin panel, Podman, upgrades, backups,
  troubleshooting
- [Using Omicron](https://docs.omicron.blog/using/writing) — writing, profiles,
  reading, lists, moderation, writer dashboard
- [Federation](https://docs.omicron.blog/federation/overview) — how it works,
  endpoints, delivery, compatibility
- [Development](https://docs.omicron.blog/development/architecture) —
  architecture, local setup, backend and frontend guides, migrations,
  contributing
- [Reference](https://docs.omicron.blog/reference/environment) — environment
  variables, HTTP and admin APIs, rate limits

## Development

```bash
# Postgres must be running and DATABASE_URL set.
cd apps/backend && deno task dev              # http://localhost:8000
cd apps/frontend && pnpm install && pnpm dev  # http://localhost:5173
```

See the [local setup guide](https://docs.omicron.blog/development/local-setup)
for the full picture.

## Security

Report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## License

Omicron is free software licensed under the **GNU Affero General Public License
v3.0 or later** (AGPL-3.0-or-later). See [LICENSE](LICENSE) for the full text.

Because Omicron is typically run as a network service, the AGPL's §13 applies:
if you run a modified version on a server and let users interact with it over a
network, you must offer those users the corresponding source code of your
modified version. The app surfaces a "Source" link in the UI for this purpose —
point it at your fork if you deploy changes.
