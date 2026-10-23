-- Applications authenticate via Next.js, never via Supabase Auth.
-- Disable all direct anon/authenticated Data API access to private app tables.
-- Server-side PostgreSQL uses the database owner; Supabase Realtime uses the service_role.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','sessions','auth_tokens','auth_limits','packages','media_assets','bookings','booking_history','messages','message_reads','site_content','system_settings','backup_logs','audit_logs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- Publication subscriptions use the service role exclusively on the backend.
-- No client browser receives the service role key or database row payloads.
--> statement-breakpoint
-- Explicit SELECT grant for server-side Supabase Realtime subscriptions.
GRANT SELECT ON TABLE public.bookings, public.booking_history, public.messages, public.packages, public.site_content TO service_role;
