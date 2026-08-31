His setup is Docker + an existing Postgres with real users. The schema migration (`0034_better_auth`) runs **automatically** when the backend boots — there's no separate migrate command. The whole job is: back up, rebuild, restart.

**1. Back up the database first** (non-negotiable — this migration drops the old `sessions`/`auth_tokens` tables and rewrites `users`):

```bash
docker compose exec postgres pg_dump -U omicron omicron > omicron-backup-$(date +%F).sql
```

**2. Get the merged code** (after the PR is merged to `main`):

```bash
git pull
```

**3. Rebuild the images and restart** — `--build` is essential so `better-auth` gets installed into both images from the updated `package.json`/`pnpm-lock.yaml`:

```bash
docker compose up -d --build backend frontend
```

**4. Watch the backend apply the migration on boot:**

```bash
docker compose logs -f backend
```

He should see `✔ applied 0034_better_auth` followed by `✔ Migrations 1 applied`. That single migration creates the `accounts`/`verifications` tables, backfills one credential row per existing user from their bcrypt hash, and migrates `email_verified`.

**What to expect afterward:**

- **No password resets** — existing bcrypt passwords keep working (verified end-to-end).
- **Everyone is logged out once** — old sessions were dropped; users sign in again normally.
- Password reset is now **email-only** (was username-or-email).

**If anything looks wrong**, roll back by redeploying the previous image tag and restoring the dump:

```bash
docker compose exec -T postgres psql -U omicron omicron < omicron-backup-<date>.sql
```
