CREATE TABLE IF NOT EXISTS "notification_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL REFERENCES "public"."bookings"("id") ON DELETE CASCADE,
  "event_key" varchar(180) NOT NULL UNIQUE,
  "event_type" varchar(48) NOT NULL,
  "channel" varchar(12) NOT NULL,
  "recipient" varchar(320) NOT NULL,
  "payload" jsonb NOT NULL,
  "status" varchar(20) DEFAULT 'PENDING' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "provider_id" varchar(128),
  "last_error" text,
  "processed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notify_channel_check" CHECK ("channel" IN ('EMAIL','SMS')),
  CONSTRAINT "notify_status_check" CHECK ("status" IN ('PENDING','PROCESSING','RETRY','ACCEPTED','FAILED'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notify_pending_idx" ON "notification_outbox" ("status", "next_attempt_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notify_booking_idx" ON "notification_outbox" ("booking_id");
--> statement-breakpoint
ALTER TABLE "notification_outbox" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "notification_outbox" FROM anon, authenticated;
--> statement-breakpoint
-- Access is exclusively through Next.js server-side PostgreSQL credentials.
