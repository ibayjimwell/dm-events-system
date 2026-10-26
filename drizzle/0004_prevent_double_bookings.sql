-- DM Events operates one held/confirmed event per calendar date.
-- Tentative inquiries are not reservations. Resolve existing conflicts before applying.
DO $$
DECLARE conflicting_dates text;
BEGIN
  SELECT string_agg(event_date::text || ' (' || refs || ')', '; ') INTO conflicting_dates
  FROM (
    SELECT event_date, string_agg(reference, ', ' ORDER BY reference) AS refs
    FROM public.bookings
    WHERE status IN ('HELD', 'CONFIRMED')
    GROUP BY event_date
    HAVING count(*) > 1
  ) conflicts;
  IF conflicting_dates IS NOT NULL THEN
    RAISE EXCEPTION 'Resolve existing Held/Confirmed double bookings before migration: %', conflicting_dates;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_one_reserved_date"
ON "public"."bookings" ("event_date")
WHERE "status" IN ('HELD', 'CONFIRMED');
