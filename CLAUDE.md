# CLAUDE.md

## Project Overview

This is a **federated blogging platform** (Medium-like, ActivityPub-powered).

Core goals:

- Clean architecture
- No vendor lock-in
- Self-hostable instances
- Easy setup and easy upgrades
- High performance with simple design
- AI-friendly, readable codebase

---

## Tech Stack

### Backend
- Deno
- Hono
- Fedify (ActivityPub)
- PostgreSQL
- Drizzle ORM

### Frontend
- SvelteKit
- bits-ui (strictly use this for everything possible)
- TailwindCSS
- Tiptap (editor)
- Lucide (icons)

---

## Architecture Rules (STRICT)

### 1. Layered Architecture

NEVER mix responsibilities:

- `routes/` → HTTP only
- `services/` → business logic
- `db/` → database (Drizzle only)
- `federation/` → ActivityPub logic

No direct DB calls in routes.

---

### 2. Repository Pattern (MANDATORY)

All database access must go through repository functions.

❌ Do NOT:
```ts
db.select().from(posts)
```

✅ DO: call a repository function instead.

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
   component (see each component page on bits-ui.com). The docs use Tailwind v4;
   this project is v3.4, so adapt only the syntax:
   - `outline-hidden` → `outline-none`
   - `ring-0!` → `!ring-0`
   - `data-highlighted:` → `data-[highlighted]:`

### Where the theme lives

- Tokens (colours/radii/shadows/fonts): `apps/frontend/tailwind.config.ts`
- CSS variables (ported verbatim from the docs `:root`): `apps/frontend/src/app.css`

These are ported from the Bits UI docs theme
(`docs/src/lib/styles/app.css` in `huntabyte/bits-ui`). Keep them in sync with
the docs; do not invent new design tokens.

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
memory. That repo's own `CLAUDE.md` has its full rules.

---

## Git workflow (STRICT)

**Never push directly to the default branch.** Every change — a one-line typo
fix included — goes through a pull request. Same rule in `omicron-docs`.

```
git checkout -b fix/short-kebab-description
```

Prefixes: `fix/`, `feat/`, `docs/`, `refactor/`, `chore/`.

### Commits

One logical change per commit, with a conventional-commit subject
(`fix(anubis): …`, `docs: …`). Split a branch into several commits when the
change has genuinely separable parts — each one should be revertable on its own
and leave the repo working. The body explains **why**, not what the diff already
shows.

Never credit an AI assistant as author, co-author, or contributor. No
`Co-Authored-By` trailers, no "generated with" footers, in commits or PRs.

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