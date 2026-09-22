-- Moderator role. Additive and idempotent.
-- `users.is_moderator` marks an account with moderation powers (reports queue,
-- user/post/report operations) but no instance-level access (settings, email,
-- federation, domains, SEO, media). Admins implicitly hold every moderator
-- power (see routes/middleware.ts requireModerator). Only admins can grant or
-- revoke it (see services/moderation.ts setModeratorRole).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_moderator" boolean DEFAULT false NOT NULL;
