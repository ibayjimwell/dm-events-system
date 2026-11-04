# DM Events — Backup History & Automatic Backups (Patch)

**Baseline:** the DM Events system with the Simple Backup and Database Backup UI updates, plus previous booking/messaging/feedback patches.

This archive contains the **complete content of every added/modified file**. Extract it into the project root, preserving paths. Do not replace your live `.env` or `.env.local` files.

## Install

```bash
cd ~/dm-events-system
# Extract the patch ZIP here, preserving the folders.
bash apply-backup-history-patch.sh

# Generate two DIFFERENT keys; do not publish them:
openssl rand -hex 32  # set as BACKUP_ARCHIVE_KEY
openssl rand -hex 32  # set as CRON_SECRET

# Put those keys in .env.local and Vercel Environment Variables.
# Existing DATABASE_URL, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are also needed.
npm ci
npm run db:migrate
npm run typecheck
npm run build
```

Deploy the project to your existing Vercel project. `vercel.json` registers one **daily** authenticated check; choose a backup schedule in the dashboard. The Storage bucket will be created privately on first successful archive creation.

**Important:** `BACKUP_ARCHIVE_KEY` must be preserved. If lost or changed, existing encrypted stored archives will no longer be downloadable.

## What changes

- Database Backup dashboard with summaries, size chart, and filterable archive history.
- Detailed record counts per database table, plus authorized archive download and permanent deletion.
- Manual create and automatic **Daily / Weekly (Monday) / Monthly (1st day) / Off** schedules.
- New private Supabase Storage bucket `dm-events-database-backups`, with AES-256-GCM encrypted archives.
- New `backup_archives` and `backup_schedules` database tables (migration `0013_backup_history_schedule.sql`).
- Server-authorized backup APIs and one authenticated Vercel cron endpoint.
- An install script that removes the obsolete Cloudflare/GitHub backup cron path, helper modules/workflow and stale generated route types.

## Required safety checks

1. Create a manual backup from the admin page. Check its status and table counts.
2. Download the archive and verify it locally using `npm run backup:verify -- ./your-backup.json.gz`.
3. Select a schedule and save; confirm its next run date is displayed.
4. Verify the scheduled function appears under Vercel → Project → Cron Jobs after deployment.
5. Test recovery **only on an empty staging database** using the existing guarded restore script.

## Limits

This is a data-only backup of public PostgreSQL tables, not a complete managed Supabase backup. Files and media held in Cloudinary or Supabase Storage, Supabase Auth, project secrets and schema definitions are not included. The encrypted archive is stored in the **same Supabase project** as the database; download separate offline copies to protect against a full-project outage. The original small-project export limits still apply. Storage and function free-tier quotas apply; no new paid account is required within those limits.

See `docs/BACKUP_HISTORY_AND_SCHEDULING.md` for detailed security, hosting, schedule and recovery behavior.

## Verification performed

194 automated source/regression tests passed, including backup crypto and schedule logic. A complete Next.js production build and an actual Supabase backup could not be run in this workspace because the npm dependency installation is incomplete. Run the installation commands above before deploying.
