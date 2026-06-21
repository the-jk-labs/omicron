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