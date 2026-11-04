-- Metadata for privately stored database snapshots. The encrypted files live in
-- Supabase Storage, OUTSIDE these PostgreSQL tables.
CREATE TABLE IF NOT EXISTS public.backup_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  source varchar(12) NOT NULL CHECK (source IN ('MANUAL', 'SCHEDULED')),
  status varchar(12) NOT NULL CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED')),
  storage_path text,
  filename text,
  size_bytes integer,
  table_count integer,
  row_count integer,
  table_rows jsonb,
  error text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS backup_archives_created_idx ON public.backup_archives (created_at);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS backup_archives_one_running ON public.backup_archives (status) WHERE status = 'RUNNING';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.backup_schedules (
  id varchar(24) PRIMARY KEY DEFAULT 'main',
  frequency varchar(12) NOT NULL DEFAULT 'OFF' CHECK (frequency IN ('OFF', 'DAILY', 'WEEKLY', 'MONTHLY')),
  next_run_at timestamptz,
  last_attempt_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
INSERT INTO public.backup_schedules (id, frequency) VALUES ('main', 'OFF') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
ALTER TABLE public.backup_archives ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.backup_schedules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE public.backup_archives, public.backup_schedules FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.backup_archives, public.backup_schedules TO service_role;
