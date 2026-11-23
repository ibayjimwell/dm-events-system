-- DM Events: run in the Supabase SQL Editor for the SAME project as DATABASE_URL.
-- Requires 0007_realtime_chat_presence and 0011_budget_calendar_chat_retention.
-- Idempotent: safe to run again. Keeps the private table RLS policies unchanged.
DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE EXCEPTION 'Supabase Realtime publication does not exist. Enable Realtime for this project in Supabase Dashboard first.';
  END IF;
  FOREACH t IN ARRAY ARRAY[
    'bookings', 'booking_history', 'messages', 'message_reads',
    'message_typing', 'message_thread_preferences',
    'message_thread_deletions', 'packages', 'site_content'
  ] LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE EXCEPTION 'Missing public.%; apply DM Events migrations first', t;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
    -- The server-side service role reads published changes; the browser never
    -- receives the service key or direct access to these tables.
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

-- Status report: expect 9 rows after executing the DO block above.
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
  AND tablename IN (
    'bookings','booking_history','messages','message_reads','message_typing',
    'message_thread_preferences','message_thread_deletions','packages','site_content'
  )
ORDER BY tablename;

-- Note: DELETE on messages may expose only its primary key due to RLS.
-- The bridge handles such events with a data-free, permission-scoped resync.
