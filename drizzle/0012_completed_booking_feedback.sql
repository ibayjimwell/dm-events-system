-- Completion is an explicit staff decision. It is distinct from confirmation.
ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'COMPLETED';
--> statement-breakpoint
CREATE TABLE public.booking_service_feedback (
  booking_id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL CHECK (length(btrim(comment)) BETWEEN 20 AND 1500),
  public_consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX booking_service_feedback_public_idx ON public.booking_service_feedback(public_consent_at, created_at);
--> statement-breakpoint
CREATE INDEX booking_service_feedback_client_idx ON public.booking_service_feedback(client_id);
--> statement-breakpoint
ALTER TABLE public.booking_service_feedback ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE public.booking_service_feedback FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.booking_service_feedback TO service_role;
