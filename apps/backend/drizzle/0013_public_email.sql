-- Optional public contact email shown on a user's profile (separate from the
-- private login `email`). Additive and idempotent.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "public_email" text DEFAULT '' NOT NULL;
