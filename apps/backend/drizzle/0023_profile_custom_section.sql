-- Profile custom section: a free-form Markdown block shown at the top of a
-- user's About tab. Additive and idempotent. `custom_section` stores the
-- Markdown source the author edits; `custom_section_html` stores the rendered
-- and sanitized HTML the reader receives, so rendering happens once, on write.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "custom_section" text NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "custom_section_html" text NOT NULL DEFAULT '';
