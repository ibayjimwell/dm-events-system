-- Private, short-lived typing signals for authenticated application users.
-- These rows contain no message body. A stale typing row expires automatically
-- from the application view; cleanup can run later without affecting correctness.
CREATE TABLE IF NOT EXISTS public.message_typing (
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  is_typing boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_typing_pkey PRIMARY KEY (booking_id, user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS message_typing_expires_idx ON public.message_typing (expires_at);
--> statement-breakpoint
ALTER TABLE public.message_typing ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE public.message_typing FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT ON TABLE public.message_typing, public.message_reads TO service_role;
