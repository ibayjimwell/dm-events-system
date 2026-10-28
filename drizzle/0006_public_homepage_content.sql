-- Published homepage sections. Existing site title, photo, contact details and
-- draft remain unchanged; legacy content defaults are provided in application code.
ALTER TABLE "public"."site_content"
  ADD COLUMN IF NOT EXISTS "homepage" jsonb NOT NULL DEFAULT '{}'::jsonb;
