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
cd apps/backend && deno task dev              # http://localhost:8000
cd apps/frontend && pnpm install && pnpm dev  # http://localhost:5173
```

See the [local setup guide](https://docs.omicron.blog/development/local-setup/)
for the full picture.

## Publishing from an external CMS

Any writer can publish into their own blog from an external system — Sanity,
Contentful, a static-site build hook, a script. Mint a token under **Settings →
Integrations**, give it to that system, and the posts it sends are published
under your name and federate like anything you write in the editor. Revoke the
token any time to cut it off.

```bash
curl -X POST https://your-domain/api/webhooks/content \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $OMICRON_TOKEN" \
  -d '{
    "title": "Europe is ditching Visa and Mastercard",
    "body": "## The short version\n\nIt is a **huge** step.",
    "description": "Why the EU payments shift matters.",
    "banner": "https://cdn.example.com/covers/eu-payments.jpg",
    "slug": "eu-payments",
    "tags": ["fintech", "europe"]
  }'
# → 201 {"id":"…","slug":"eu-payments","status":"published","created":true}
```

Only `title` and `body` (Markdown) are required. `description` defaults to the
first ~150 characters of the body; `slug` defaults to the title's slug and is
what makes re-sends idempotent — POST the same `slug` again and your existing
post is updated (`200`, `"created": false`) instead of duplicated. Slugs are
scoped to you, so they never collide with another writer's. The token also
travels as `Authorization: Bearer <token>`. An unknown credential gets `401`
and an invalid payload `400` naming the field.

Updates are partial: send only what changed, and everything you leave out keeps
its current value. Once the post exists, `slug` alone identifies it, so `title`
and `body` are needed only on the first send.

```bash
# Unpublish, without resending the article.
-d '{"slug": "eu-payments", "status": "draft"}'
# Retitle it.
-d '{"slug": "eu-payments", "title": "Europe ditches the card networks"}'
# Drop the cover — `null` clears a field, leaving it out preserves it.
-d '{"slug": "eu-payments", "banner": null}'
```

Operators can also set an instance-wide `WEBHOOK_SECRET` (see
[.env.example](.env.example)) for publishing without a user token — a migration
script, say. Full reference:
**[docs.omicron.blog/reference/content-webhook](https://docs.omicron.blog/reference/content-webhook/)**

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
