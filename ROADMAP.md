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
- [x] Instance-level defederation / domain blocklist. `blocked_domains` table;
      a block matches the exact host and any subdomain (`lib/domain.ts`).
      Enforced on every federation path — inbound inbox (drops Follow/Undo/
      Accept/Create from blocked senders), outbound delivery (skips blocked
      recipients), and browse-time fetch (`remote.ts` refuses lookups). Blocking
      purges already-cached actors + their posts. Endpoints `GET/POST/DELETE
      /admin/domains`. Cached in-process (30s TTL) for the hot path.
- [x] Admin moderation queue view (frontend). Dedicated admins-only `/admin` tab
      (side rail + avatar menu) with Reports / Users / Federation / Instance tabs;
      queue shows open/resolved with remove-post, suspend-account and dismiss.
- Files: `routes/admin.ts`, `routes/reports.ts`, `services/moderation.ts`,
  `db/repositories/{reports,users,blockedDomains}.ts`, `lib/domain.ts`,
  `federation/{mod,deliver,remote}.ts`, schema + `0017_moderation` +
  `0018_blocked_domains`, frontend `routes/admin/`,
  `components/Admin{Users,Reports,Domains}.svelte`.

### 5. Don't expose internal services on the public interface

Caddy is the only intended ingress (it terminates TLS and reverse-proxies
federation → backend, everything else → frontend, over the internal Docker
network — see `Caddyfile`). But `docker-compose.yml` also publishes
`backend :8000` and `frontend :3000→5173` on the host, i.e. `0.0.0.0`. On a
public VPS that puts the **full JSON API and the app on plain HTTP**, bypassing
TLS, the on-demand-cert flow, and the single-entrypoint model. Cookies/tokens
sent to `http://host:8000` would travel unencrypted.

- [x] Bind the debug ports to loopback only — `docker-compose.yml` now publishes
      `127.0.0.1:8000:8000` and `127.0.0.1:5173:3000`, so they're reachable for
      local debugging but never on the host's public interface. Caddy reaches
      both over the compose network regardless.
- [x] Fix the stale comment on the backend `ports:` entry (federation reaches
      `/.well-known` and `/users` through Caddy, not via a published `:8000`).
- [x] Verify in an isolated stack that federation, the wizard, and the API still
      work end to end with the ports fully unpublished — all traffic via Caddy:
      app root → `303 /setup`, `GET /api/instance` → backend JSON, and (with
      federation on) `/.well-known/nodeinfo` → `200` from the backend.

---

## P1 — Federation correctness

Ship-soon; wrong behaviour here degrades trust across the network.

### 5. Inbound Delete / Update

Remote edits and deletes are currently ignored, leaving stale/deleted copies
(also a right-to-delete / GDPR concern).

- [x] Handle `Update(Article)` — re-sanitize and update the cached post in place.
      Ownership-checked (the editor must be the post's cached author); tags
      refreshed. Only Articles we already cache are touched.
- [x] Handle `Delete` — remove the cached post by its ActivityPub id (ownership
      checked so one actor can't delete another's post).
- [x] Handle `Delete(Actor)` — when the deleted object is the sender itself,
      purge the cached remote actor; their posts, follow edges, etc. cascade.
- Files: `federation/mod.ts` inbox listeners (`Update`/`Delete`),
  `db/repositories/{posts,remoteActors}.ts` (`removeByApId`). All inbound
  handlers also drop activities from defederated domains (see P0 #4).

### 6. Outbound Update / Delete

- [x] Deliver `Update(Article)` when a local author edits a post. Editing an
      already-published post enqueues `federate_post` with `action: "update"`
      (fresh activity id, stable object id); publishing a draft for the first
      time still sends a `Create`.
- [x] Deliver `Delete` when a local author (or an admin takedown) deletes a
      post. `deletePost` captures the author before removal and enqueues
      `federate_post_delete`; delivery sends a `Delete` with a `Tombstone`
      whose id matches the cached Article, so remote instances drop the copy.
      Only ever-published posts fan out (drafts were never federated).
- [x] Deliver `Delete(Actor)` on account deletion — `services/auth.ts` enqueues
      `delete_actor`, which broadcasts `Delete(actor)` to remote followers via
      `sendActorDelete` before the row (and its cascades) is removed.
- Files: `federation/outbound.ts`, `federation/deliver.ts`, `queue/handlers.ts`,
  `queue/queue.ts`, `services/posts.ts`.

### 7. Federation robustness

- [x] Verify HTTP signature handling on all inbound activities (Fedify defaults
      audited). Every inbound activity is HTTP-Signature-verified within a
      one-hour timestamp window; `skipSignatureVerification: false` is now set
      explicitly in `createFederationInstance` so the guarantee can't silently
      drift. Fedify only invokes an `.on(...)` listener after verification.
- [x] Bound inbox payload size and reject oversized/malformed objects early.
      Declared Content-Length over `INBOX_MAX_BODY_BYTES` is rejected up front
      (413); the body is then buffered under a hard byte cap (`lib/inboxBody.ts`)
      so a missing/chunked/spoofed length can't stream an unbounded payload into
      Fedify's parser, and the request is rebuilt so the HTTP-Signature digest
      still verifies. Malformed/unknown-type objects are dropped by the
      listeners (Articles only; ownership/id checks).
- [x] Confirm delivery retry/backoff behaviour and dead-letter visibility.
      Outbound delivery now runs through an `InProcessMessageQueue`, giving
      Fedify's default retry/backoff (exponential, up to 10 attempts over ~12h)
      instead of a single synchronous send. `onOutboxError` logs each failed
      attempt; `setOutboxPermanentFailureHandler` logs dead-letters once Fedify
      gives up (permanent HTTP failure or circuit-breaker expiry). Queue is
      in-process/non-durable for now — swap for Redis with the KV backend.
- Files: `federation/mod.ts` (queue + signature/error handlers), `app.ts` +
  `lib/inboxBody.ts` (capped-body inbox guard).

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
- [x] Backup/restore guidance in docs (README "Backups & restore"), covering
      **all** stateful volumes. Two verified strategies: (A) logical `pg_dump`
      + `uploads`/`caddy_data`, letting `secrets` regenerate (portable, live-safe,
      resets sessions); (B) full volume snapshot of all five volumes together
      (version-locked, keeps sessions). Both round-trip-tested end to end; docs
      call out the `pgdata`↔`secrets/db_password` pairing so a partial restore
      can't silently break the backend.

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

**Safe public launch = all of P0 + items 5 and 7 from P1.**
Everything else can land on a running instance without breaking existing data,
per the additive migration policy.

**Production-ready operations** is a higher bar than a safe launch and adds, at
minimum, P2 §8 (a real test suite — the tree currently has **zero** tests, so
nothing guards against an auth or federation regression) and P2 §10's
backup/restore guidance. Until those land, treat deployments as early-adopter,
back them up manually, and pin to a known-good commit.
