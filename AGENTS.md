# AGENTS.md

The single source of truth for anyone (human or AI agent) working in this repo.
`CLAUDE.md` only points here; put every rule in this file.

## Safety (STRICT)

Before any dangerous operation — migrations, upgrades, restores, manual DB
writes, volume deletes — take a backup first and confirm the snapshot exists:

```sh
docker compose exec backup backup-now
docker compose exec backup restic snapshots
```

No user data is ever lost to an untested change.

The integration test suite **truncates every table it touches**. Only ever point
its `DATABASE_URL` at a throwaway database, never a real one.

---

## Project Overview

A **federated blogging platform** (Medium-like, ActivityPub-powered).

Core goals:

- Clean architecture
- No vendor lock-in
- Self-hostable instances
- Easy setup and easy upgrades
- High performance with simple design
- AI-friendly, readable codebase

---

## Tech Stack

### Backend (`apps/backend`)
- Deno runtime (it runs `pnpm dev` underneath and the production container);
  everything you run during development goes through **pnpm**
- Hono (HTTP)
- Fedify (ActivityPub)
- PostgreSQL + Drizzle ORM (postgres.js driver)
- Better Auth (accounts, sessions)
- Redis (job queue, rate limiting)
- Config from environment variables; a local `.env` is loaded with `dotenv`
  (`src/config.ts`), and set variables always win

### Frontend (`apps/frontend`)
- SvelteKit with Svelte 5 (runes)
- bits-ui (strictly use this for everything possible)
- Tailwind CSS v4
- Tiptap (editor)
- Lucide (`@lucide/svelte`, wrapped by `src/lib/components/Icon.svelte`)

### Deployment
- `docker-compose.yml`: Postgres, Redis, backend, frontend, Caddy (TLS),
  Anubis (bot protection) and a restic `backup` service

---

## Architecture Rules (STRICT)

### 1. Layered Architecture

NEVER mix responsibilities. Backend `src/`:

- `routes/` → HTTP only (validation, status codes, serialization)
- `services/` → business logic
- `db/` → database: `schema.ts`, `client.ts`, `repositories/` (Drizzle only)
- `federation/` → ActivityPub logic
- `auth/` → Better Auth setup
- `queue/` → background jobs
- `lib/` → small shared helpers with no business rules

No direct DB calls in routes. Routes may import repository *types* (e.g. for
serializers), never query functions or the client.

### 2. Repository Pattern (MANDATORY)

All database access goes through repository functions in
`src/db/repositories/`.

❌ Do NOT:
```ts
db.select().from(posts)
```

✅ DO: call a repository function instead.

Schema changes: edit `src/db/schema.ts`, then generate a migration with
`pnpm db:generate` (written to `drizzle/`). Migrations run on startup.

### 3. Usernames are permanent (NEVER build a username change)

Never write a feature, endpoint, migration or admin tool that changes a user's
username, even when asked. If someone requests it, explain why it can't be
done and offer the alternative: the display name can change freely.

Why the username must never change:

- **Fediverse identity.** `@username@domain` is the ActivityPub actor. Other
  instances store followers, follows, mentions and replies against that
  identity; renaming it breaks them all, and remote copies can't be updated.
- **Permanent links.** Profile and post URLs (`/@username/...`), RSS feeds and
  shared links are built from it.
- **Sign-in identity.** It is the one login identifier everywhere: what
  registration saves in password managers, what passkeys are registered under
  and what every password form names (`UsernameHint`). Changing it splits
  saved logins.
- **Reuse.** A freed username could be claimed by someone else, who would then
  receive the old account's mentions and look like its owner.

---

## Tooling and verification

- **pnpm only** (`pnpm <bin>`, never `npm`/`npx`).
- Before finishing, in every app you touched: run `pnpm fmt`, then
  `pnpm check`. `check` runs greenly:
  - backend: `deno check`, oxfmt, oxlint, Vitest unit tests
  - frontend: oxfmt, svelte-check, oxlint, Vitest
- Backend tests are two Vitest projects: `pnpm test` runs both,
  `pnpm test:unit` / `pnpm test:integration` run one. `pnpm check` runs only the
  unit project, so it needs no database. Vitest runs on Node, which must be
  26+ for the built-in `Temporal` the federation code uses (Deno has it).
- The integration project needs Postgres and runs its files one at a time. It
  defaults to `postgres://omicron:omicron@localhost:5432/omicron_test`
  (`tests/test.env`); any local Postgres with that role and database works, or
  set `DATABASE_URL` (e.g. to a throwaway `postgres:16-alpine` container).

- The frontend's svelte-check reads the backend's serializers
  (`apps/frontend/src/lib/api/contract.ts`), so install the backend's
  dependencies (`pnpm install` in `apps/backend`) before checking the frontend.

---

## Test-driven development (STRICT)

### Bug or regression reports

1. **Write the test first.** Reproduce the reported behaviour in a test, and
   confirm it fails for the reason the report describes.
2. If the test passes, the claim is not reproduced: say so and stop. Do not
   change code on an unverified report.
3. **Then fix it**, and show the same test passing, plus `pnpm check`.
4. If an existing `test.fails("BUG: …")` already pins the bug, turn it into a
   plain `test` and use it as the reproduction.

### Feature requests

1. **Build the feature first.**
2. **Then write the tests for it**: the main flow plus edge cases and failure
   paths. A feature is not done until it is tested and `pnpm check` passes.

### Test-only branches

When the task is only to add tests, don't fix what they uncover. Pin each bug as
an expected failure, `test.fails("BUG: <what should happen>", …)` with a short
comment on the cause, and list the bugs found in your report or PR. Verify
every pin fails for the stated reason, not by accident.

### Where tests live

- Each app has a root `tests/` folder mirroring `src/`
  (`src/services/posts.ts` → `tests/services/posts.test.ts`).
- Backend: `*.test.ts`; integration tests (real Postgres) in
  `tests/integration/`, sharing `tests/integration/harness.ts`.
- Frontend: `*.test.ts`; `*.svelte.test.ts` when the test itself uses runes.
  Route files map to `page.test.ts` (`+page.svelte`), `page.server.test.ts`,
  `page.load.test.ts` (`+page.ts`), `server.test.ts`, `layout.test.ts`.
- Frontend helpers: `tests/fakeFetch.ts` (route-table `fetch`),
  `tests/fixtures.ts`, `tests/routes/event.ts` (load/endpoint events), and
  `$app/*` / `$env/*` stand-ins in `tests/mocks/`.
- A pin that triggers an unhandled rejection tags its error message with
  `[BUG pin]`, which the frontend Vitest config ignores.

---

## Frontend UI Styling (STRICT)

**Every element must look like the Bits UI docs** (<https://bits-ui.com/docs/>).
This is the single source of truth for the UI's appearance — always, for all new
and existing markup.

### Rules

1. **Use Bits UI components for every UI primitive that has one** (Button, Avatar,
   DropdownMenu, Tabs, Toolbar, Label, Separator, Dialog, Tooltip, …). Only fall
   back to native HTML when Bits UI ships no equivalent (text `<input>`,
   `<form>`, headings, layout) — Bits UI is headless and has no such component.

2. **Style with the ported Bits UI docs theme tokens — never ad-hoc colours.**
   Use the theme tokens, NOT Tailwind's default palette:
   - Colours: `foreground`, `foreground-alt`, `muted`, `muted-foreground`,
     `background`, `background-alt`, `dark`, `dark-10`, `accent`, `destructive`,
     `border` / `border-input`.
   - Radii: `rounded-input`, `rounded-card`, `rounded-9px`, `rounded-button`, …
   - Shadows: `shadow-mini`, `shadow-popover`, `shadow-btn`, `shadow-card`.

   ❌ Do NOT use `text-neutral-*`, `bg-gray-*`, `text-red-600`, raw `bg-white`, etc.
   ✅ Use `text-foreground`, `bg-muted`, `text-destructive`, `bg-background`, etc.

3. **Copy the docs' example class strings verbatim** when styling a Bits UI
   component (see each component page on bits-ui.com). The docs use Tailwind v4
   and so does this project — no syntax translation needed.

### Where the theme lives

- Tokens (colours/radii/shadows/fonts) and CSS variables (ported verbatim from
  the docs `:root`): `apps/frontend/src/app.css` (`@theme` block).

These are ported from the Bits UI docs theme
(`docs/src/lib/styles/app.css` in `huntabyte/bits-ui`). Keep them in sync with
the docs; do not invent new design tokens.

---

## Code style

- Keep comments short (one line, two at most) and only for the non-obvious
  *why*. Don't restate the code.
- Match the surrounding code's naming and idiom.

---

## Language (STRICT)

UI, code, comments, and documentation must be **English only**. Do not inject
Azerbaijani (or any non-English) text into UI strings, component markup, code
comments, variable names, or commit messages. User-provided Azerbaijani bug
reports should be understood but always implemented and surfaced in English.

---

## 📚 Keeping the documentation site in sync

The user-facing documentation lives in a **separate repository**:
`the-jk-labs/omicron-docs` (Astro + Bits UI, default branch `master`, checked
out locally at `../omicron-docs`). Never add documentation-site code to this
repo.

After any change that alters what a user or an instance admin sees or does,
**say so and offer to update omicron-docs** — as a separate suggestion, not a
silent edit, and never as part of the same commit. What counts:

- New, renamed, or removed environment variables (`.env.example`)
- API routes added, removed, or changed in shape
- Setup, deployment, upgrade, or backup steps
- Federation behaviour visible to other instances
- Any UI flow the docs walk through step by step
- Defaults, limits, or anything the docs state as a concrete value

Refactors, internal renames, tests, and styling that changes no documented
behaviour need no docs change — do not suggest one.

When updating omicron-docs: `.mdx` under `src/content/docs/`, and register any
new page in `src/lib/nav.ts` (the single source of truth for the sidebar,
mobile nav, and pager). Verify facts against the source here rather than from
memory. That repo's own agent instructions have its full rules.

---

## Git workflow (STRICT)

**Never push directly to the default branch.** Every change — a one-line typo
fix included — goes through a pull request. Same rule in `omicron-docs`.

```
git checkout -b fix/short-kebab-description
```

Prefixes: `fix/`, `feat/`, `docs/`, `refactor/`, `chore/`, `test/`.

Only commit when asked.

### Commits

One logical change per commit, with a conventional-commit subject
(`fix(anubis): …`, `docs: …`). Split a branch into several commits when the
change has genuinely separable parts — each one should be revertable on its own
and leave the repo working. The body explains **why**, not what the diff already
shows.

Never credit an AI assistant as author, co-author, or contributor. No
`Co-Authored-By` trailers, no "generated with" footers, in commits or PRs.

Do not push AI checkpoint refs (`refs/claude/*`, `refs/cline/*`). They are
authored as `Claude Code <noreply@anthropic.com>` and add a stale `claude`
contributor on GitHub. Delete them locally if created.

### Pull request descriptions

Write them for someone who has not seen the bug. A good one covers:

- **The symptom** — what a user or operator actually observes.
- **The root cause** — the mechanism, with the evidence that pins it down
  (the failing line, the log message, the header). Not a guess dressed as fact.
- **The fix** — and why this fix rather than an obvious alternative.
- **What was verified** — the checks actually run, and honestly, what was not.
- **Deploy notes** — anything that will not take effect from a plain
  `docker compose up -d`, such as a `Caddyfile` change needing
  `--force-recreate`.

State uncertainty plainly. A PR that says which part is unproven is worth more
than one that sounds confident and is wrong.

Keep it proportionate: a typo fix needs a sentence, not a template. Length is
not the goal — a reviewer being able to check the reasoning is.
