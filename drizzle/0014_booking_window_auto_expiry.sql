-- Automatic booking cancellations run as the system, not as a human staff user.
-- Retain all history, audit, and immutable financial movements.
ALTER TABLE public.booking_history
  ALTER COLUMN actor_id DROP NOT NULL;
