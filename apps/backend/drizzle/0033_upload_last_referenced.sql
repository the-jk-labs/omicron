-- Upload GC bookkeeping: when a file was last seen referenced. Additive and
-- idempotent.
--
-- The GC sweep (services/uploadGc.ts) refreshes this for every file still
-- referenced by a profile, post, or the instance banner, then reaps only rows
-- that have lagged behind by the full grace period. Keying the grace period on
-- "last seen referenced" rather than "created" is what makes replacement safe:
-- an avatar replaced after 5 years still gets its full grace period.
ALTER TABLE "uploads" ADD COLUMN IF NOT EXISTS "last_referenced_at" timestamp with time zone DEFAULT now() NOT NULL;