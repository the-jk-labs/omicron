# CLAUDE.md

## 🧠 Project Overview

This is a **federated blogging platform** (Medium-like, ActivityPub-powered).

Core goals:

- Clean architecture
- No vendor lock-in
- Self-hostable instances
- Easy setup and easy upgrades
- High performance with simple design
- AI-friendly, readable codebase

---

## ⚙️ Tech Stack

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

## 🏗️ Architecture Rules (STRICT)

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

## 🎨 Frontend UI Styling (STRICT)

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