-- Operational planning details; one Held/Confirmed reservation per date remains the business rule.
ALTER TABLE "public"."bookings" ADD COLUMN IF NOT EXISTS "event_start_time" varchar(5);
--> statement-breakpoint
ALTER TABLE "public"."bookings" ADD COLUMN IF NOT EXISTS "event_end_time" varchar(5);
--> statement-breakpoint
ALTER TABLE "public"."bookings" ADD COLUMN IF NOT EXISTS "assigned_coordinator_id" uuid CONSTRAINT "bookings_assigned_coordinator_id_users_id_fk" REFERENCES "public"."users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "public"."bookings" ADD COLUMN IF NOT EXISTS "schedule_notes" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "public"."bookings" ADD COLUMN IF NOT EXISTS "schedule_updated_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "public"."bookings" ADD CONSTRAINT "booking_times_pair_check"
CHECK ((event_start_time IS NULL AND event_end_time IS NULL) OR
       (event_start_time IS NOT NULL AND event_end_time IS NOT NULL AND
        event_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND
        event_end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND
        event_start_time < event_end_time));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_assigned_coordinator_idx" ON "public"."bookings" ("assigned_coordinator_id", "event_date");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "public"."booking_value_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "booking_id" uuid NOT NULL CONSTRAINT "booking_value_events_booking_id_bookings_id_fk" REFERENCES "public"."bookings"("id") ON DELETE RESTRICT,
  "actor_id" uuid CONSTRAINT "booking_value_events_actor_id_users_id_fk" REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "event_type" varchar(20) NOT NULL,
  "amount_delta" numeric(14,2) NOT NULL,
  "value_after" numeric(14,2) NOT NULL,
  "recorded_at" timestamptz NOT NULL DEFAULT now(),
  "note" text,
  CONSTRAINT "booking_value_events_type_check" CHECK (event_type IN ('CONFIRMATION','ADJUSTMENT','REVERSAL')),
  CONSTRAINT "booking_value_events_value_after_check" CHECK (value_after >= 0),
  CONSTRAINT "booking_value_events_nonzero_check" CHECK (amount_delta <> 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_value_events_month_idx" ON "public"."booking_value_events" ("recorded_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_value_events_booking_idx" ON "public"."booking_value_events" ("booking_id");
--> statement-breakpoint
-- Backfill current confirmed commitments once. Historical adjustments before migration
-- cannot be reconstructed; this is an opening baseline, not a historical revenue audit.
INSERT INTO "public"."booking_value_events"
("booking_id", "actor_id", "event_type", "amount_delta", "value_after", "recorded_at", "note")
SELECT b.id, NULL::uuid, 'CONFIRMATION', b.booked_value, b.booked_value,
       COALESCE(b.confirmed_at, b.updated_at, b.created_at),
       'Opening confirmed-value baseline imported at migration'
FROM "public"."bookings" b
WHERE b.status = 'CONFIRMED' AND b.booked_value > 0
  AND NOT EXISTS (SELECT 1 FROM "public"."booking_value_events" e WHERE e.booking_id = b.id);
