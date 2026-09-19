-- Better Auth 1.7.3+ removes the `issuer` column that 1.7.0–1.7.2 required.
-- Accounts are recognized by (provider_id, account_id) again, as in 1.6. Drop
-- the compound unique index BEFORE the column, then re-key on (provider_id,
-- account_id). Credential rows keep provider_id 'credential' + account_id =
-- user id, so they stay unique across the switch.

DROP INDEX IF EXISTS "accounts_issuer_account_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_provider_account_idx" ON "accounts" ("provider_id","account_id");--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "issuer";
