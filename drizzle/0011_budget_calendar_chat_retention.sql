-- User-visible budgets and agreed booking values must be at least PHP 5,000.
-- Existing non-numeric estimated budgets cannot be interpreted safely and are
-- flagged at the required minimum for staff to review. Save a DB backup first.
UPDATE public.bookings
SET estimated_budget = '5000.00', updated_at = now()
WHERE estimated_budget !~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$'
   OR (CASE WHEN estimated_budget ~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$'
       THEN estimated_budget::numeric ELSE 0 END) < 5000;
--> statement-breakpoint
-- Apply a traceable correction BEFORE changing the stored current agreed amount.
INSERT INTO public.booking_value_events
(booking_id, actor_id, event_type, amount_delta, value_after, recorded_at, note)
SELECT id, NULL::uuid, 'ADJUSTMENT', 5000.00 - booked_value, 5000.00,
       now(), 'Minimum PHP 5,000 policy correction; historical ledger unchanged'
FROM public.bookings
WHERE status = 'CONFIRMED' AND booked_value IS NOT NULL AND booked_value < 5000;
--> statement-breakpoint
UPDATE public.bookings
SET booked_value = 5000.00, updated_at = now()
WHERE booked_value IS NOT NULL AND booked_value < 5000;
--> statement-breakpoint
-- Correct confirmed legacy records that were missing an agreed amount.
UPDATE public.bookings SET booked_value = 5000.00, updated_at = now()
WHERE status = 'CONFIRMED' AND booked_value IS NULL;
--> statement-breakpoint
INSERT INTO public.booking_value_events
(booking_id, actor_id, event_type, amount_delta, value_after, recorded_at, note)
SELECT b.id, NULL::uuid, 'CONFIRMATION', 5000.00, 5000.00,
       now(), 'Missing legacy confirmed booking value filled at PHP 5,000 minimum'
FROM public.bookings b
WHERE b.status = 'CONFIRMED' AND b.booked_value = 5000.00
  AND NOT EXISTS (SELECT 1 FROM public.booking_value_events e WHERE e.booking_id = b.id);
--> statement-breakpoint
ALTER TABLE public.bookings ADD CONSTRAINT bookings_budget_minimum_check
  CHECK (estimated_budget ~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$' AND estimated_budget::numeric >= 5000);
--> statement-breakpoint
ALTER TABLE public.bookings ADD CONSTRAINT bookings_booked_value_minimum_check
  CHECK ((booked_value IS NULL OR booked_value >= 5000) AND (status <> 'CONFIRMED' OR booked_value IS NOT NULL));
--> statement-breakpoint
CREATE TABLE public.message_thread_preferences (
 booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 archived_at timestamptz,
 PRIMARY KEY (booking_id, user_id)
);
--> statement-breakpoint
CREATE INDEX message_thread_preferences_user_idx ON public.message_thread_preferences(user_id);
--> statement-breakpoint
CREATE TABLE public.message_thread_deletions (
 booking_id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
 deleted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
 deleted_at timestamptz NOT NULL DEFAULT now(),
 purge_after timestamptz NOT NULL,
 purged_at timestamptz,
 CONSTRAINT message_thread_deletions_after_check CHECK (purge_after > deleted_at)
);
--> statement-breakpoint
CREATE INDEX message_thread_deletions_purge_idx ON public.message_thread_deletions(purge_after);

--> statement-breakpoint
ALTER TABLE public.message_thread_preferences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.message_thread_deletions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE public.message_thread_preferences, public.message_thread_deletions FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.message_thread_preferences, public.message_thread_deletions TO service_role;
