# Roadmap

Path from the current MVP to a public, federation-safe launch and beyond.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done.

Priority tiers are ordered. Do not start a lower tier while a **P0** item is
open — P0 is what stands between us and a safe public launch.

---

## P0 — Launch blockers (security & abuse)

Nothing ships publicly until this tier is clear.

### 1. HTML sanitization (stored XSS)

Remote Articles are stored raw and rendered with `{@html}`, so any remote actor
or local user can inject executing scripts.

- [x] Add a server-side allowlist sanitizer (tags, attributes, URL schemes).
      → `lib/sanitize.ts` (uses `sanitize-html`).
- [x] Sanitize remote content on ingest — inbox `Create` handler
      (`federation/mod.ts`) AND the browse-time outbox fetch (`federation/remote.ts`).
- [x] Sanitize local content on write — post create/update in `services/posts.ts`.
- [x] Confirm `{@html post.contentHtml}` only ever receives sanitized HTML —
      all four write paths now sanitize before store, so `contentHtml` is
      trusted downstream.
- [x] Backfill existing rows — `scripts/backfill_sanitize.ts`
      (`deno task backfill:sanitize`), covers local + remote.
- Note: backfill is a JS script, not a SQL migration — HTML sanitization can't
  run in SQL. Run it once per instance during upgrade.

### 2. Rate limiting

- [x] Fixed-window limiter with per-request key (`lib/rateLimit.ts`), in-process
      Map now, hidden behind `hit()` for a Redis swap later (queue-style).
- [x] Rate-limit auth endpoints — per-IP login (15 / 15 min) and register
      (5 / hr) limiters in `routes/auth.ts`.
- [x] Rate-limit API writes — broad backstop on all non-GET `/api/*`
      (120 / min per user, or per IP if anonymous) in `app.ts`.
- [x] Rate-limit the federation inbox — per source-IP POST cap (300 / min).
- [x] Real client IP: SvelteKit proxy now forwards `x-forwarded-for`; backend
      `clientIp()` falls back to the connection address for direct traffic.
- [x] Size-cap the inbox body — reject POSTs over `INBOX_MAX_BODY_BYTES`
      (default 1 MB) by declared content-length, before Fedify parses (413).
- [x] Env-configurable limits — `RATE_LIMIT_ENABLED` plus `RL_LOGIN_MAX`,
      `RL_REGISTER_MAX`, `RL_API_WRITE_MAX`, `RL_INBOX_MAX`, `INBOX_MAX_BODY_BYTES`
      in `config.ts` and documented in `.env.example`.

### 3. Account recovery & email

- [x] Introduce an email-sending abstraction (pluggable SMTP/provider) —
      `services/email.ts`. Ships a `console` transport (default, logs the link;
      zero-config dev) and a lazily-loaded `smtp` transport (denomailer). Config
      via `EMAIL_TRANSPORT`, `EMAIL_FROM`, `SMTP_*` in `config.ts`/`.env.example`.
- [x] Password reset flow (request + tokened confirm). Single-use, hashed,
      expiring tokens (`auth_tokens` table); reset invalidates all sessions.
      Endpoints `POST /auth/password/{forgot,reset}`; no user enumeration.
      Frontend: `/forgot-password`, `/reset-password`.
- [x] Email verification on registration (config-gated for closed instances) —
      `EMAIL_VERIFICATION_REQUIRED` gates sign-in for unverified accounts (first
      account auto-verified). Endpoints `POST /auth/email/{verify,resend}`.
      Frontend: `/verify-email` (auto-verify + resend).
- Files: `services/email.ts`, `services/auth.ts`, `routes/auth.ts`,
  `lib/tokens.ts`, `db/repositories/authTokens.ts`, schema + `0016_auth_tokens`,
  queue jobs, and the frontend auth pages.

### 4. Moderation & admin tooling

An open-speech instance needs takedown tools for legal and abuse reasons.

- [x] Report/flag flow (user reports post or actor). Signed-in users flag a post
      from its menu; `POST /reports` (per-user rate limited, dedupes open
      reports). `reports` table + queue. Frontend: report dialog on the post page.
- [x] Admin: suspend / unsuspend a local user. `users.suspended_at`; suspending
      clears sessions and blocks sign-in (login gate). Admins can't suspend
      themselves or other admins. `POST /admin/users/:id/suspend`.
- [x] Admin: remove a post. `DELETE /admin/posts/:id` (moderator override of the
      author-only delete; local posts only — remote/cached can't be removed here).
- [ ] Instance-level defederation / domain blocklist.
- [x] Admin moderation queue view (frontend). Dedicated admins-only `/admin` tab
      (side rail + avatar menu) with Reports / Users / Instance tabs; queue shows
      open/resolved with remove-post, suspend-account and dismiss actions.
- Files: `routes/admin.ts`, `routes/reports.ts`, `services/moderation.ts`,
  `db/repositories/{reports,users}.ts`, schema + `0017_moderation`, frontend
  `routes/admin/`, `components/Admin{Users,Reports}.svelte`.
- Remaining: instance-level domain blocklist / defederation (touches the
  federation inbox) — next step.

---

## P1 — Federation correctness

Ship-soon; wrong behaviour here degrades trust across the network.

### 5. Inbound Delete / Update

Remote edits and deletes are currently ignored, leaving stale/deleted copies
(also a right-to-delete / GDPR concern).

- [ ] Handle `Update(Article)` — re-sanitize and update the cached post.
- [ ] Handle `Delete` — remove the cached post / tombstone it.
- [ ] Handle `Delete(Actor)` — purge a remote actor and their cached posts.
- Files: `federation/mod.ts` inbox listeners.

### 6. Outbound Update / Delete

- [ ] Deliver `Update(Article)` when a local author edits a post.
- [ ] Deliver `Delete` when a local author deletes a post.
- [ ] Deliver `Delete(Actor)` on account deletion.
- Files: `federation/outbound.ts`, `federation/deliver.ts`, `queue/handlers.ts`.

### 7. Federation robustness

- [ ] Verify HTTP signature handling on all inbound activities (Fedify defaults
      audited).
- [ ] Bound inbox payload size and reject oversized/malformed objects early.
- [ ] Confirm delivery retry/backoff behaviour and dead-letter visibility.

---

## P2 — Reliability & operability

Needed for "seamless upgrades" to be a real promise.

### 8. Tests

- [ ] Unit tests for sanitizer, password, pagination, tag normalization.
- [ ] Repository/service integration tests against a throwaway Postgres.
- [ ] Federation tests: inbound Follow/Create/Delete, outbound delivery.
- [ ] Migration replay test (fresh DB + upgrade path).

### 9. CI/CD

- [ ] GitHub Actions: `deno task check`, `deno lint`, `npm run check`.
- [ ] Run the test suite on PRs.
- [ ] Build the Docker images in CI.
- [ ] Optional: publish tagged images.

### 10. Observability & ops

- [ ] Structured logging with levels.
- [ ] Error tracking hook (config-gated).
- [ ] Health/readiness split beyond `/healthz` (DB + queue checks).
- [ ] Backup/restore guidance for the `pgdata` volume in docs.

---

## P3 — Product polish (post-launch)

- [ ] Account deletion (local, with federation `Delete(Actor)` from P1).
- [ ] Media pipeline hardening (type/size validation, storage backend option).
- [ ] Notifications (new follower, mention, reply).
- [ ] Full-text search quality pass.
- [ ] Accessibility audit of the Bits UI surfaces.
- [ ] i18n scaffolding.

---

## Suggested launch gate

**Public launch = all of P0 + items 5 and 7 from P1.**
Everything else can land on a running instance without breaking existing data,
per the additive migration policy.
