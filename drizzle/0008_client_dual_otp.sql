-- New signups require both email and phone verification. Existing accounts are grandfathered.
-- Additive migration, safe for existing production records.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS signup_verification_required boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS auth_tokens_user_purpose_idx ON public.auth_tokens (user_id, purpose, expires_at);
