-- Read-only DM Events Realtime diagnostic. Run in Supabase SQL Editor.
-- 9 rows should appear in the first result. Any false in 'published' needs setup.
WITH required(name) AS (
  VALUES ('bookings'), ('booking_history'), ('messages'), ('message_reads'),
         ('message_typing'), ('message_thread_preferences'),
         ('message_thread_deletions'), ('packages'), ('site_content')
)
SELECT r.name AS table_name,
       to_regclass(format('public.%I', r.name)) IS NOT NULL AS table_exists,
       EXISTS (SELECT 1 FROM pg_publication_tables t
               WHERE t.pubname = 'supabase_realtime' AND t.schemaname = 'public'
                 AND t.tablename = r.name) AS published,
       has_table_privilege('service_role', to_regclass(format('public.%I', r.name)), 'SELECT') AS service_role_can_select
FROM required r
ORDER BY r.name;

-- Check whether the Supabase Realtime publication exists and its settings.
SELECT pubname, pubinsert, pubupdate, pubdelete
FROM pg_publication WHERE pubname = 'supabase_realtime';
