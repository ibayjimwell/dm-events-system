# DM Events — Legacy Backup Cleanup Fix (v2)

## Why the previous cleanup stopped

The old backup code still exists at `app/api/cron/database-backup/route.ts`. In addition, two tests contain old references. The earlier cleanup script treated the test text as runtime dependencies and only attempted to remove two legacy files.

## Apply

Copy the contents of this ZIP into the root of the **existing DM Events project**, overwriting matching files. Then run:

```bash
node scripts/clean-obsolete-backup-files.mjs
node --test tests/clean-obsolete-backup-files.test.mjs tests/backup-archive-history.test.cjs
npm run typecheck
npm run build
```

The script removes the following *old-version* source files **after verifying the modern managed backup implementation is present**:

- `app/api/backups/schedule/route.ts` (old schedule API)
- `src/lib/backupManager.ts` (old scheduler)
- `app/api/cron/database-backup/route.ts` (old cron API)

It also updates `vercel.json` to register **only one managed backup cron** at `/api/cron/daily-backup` (18:00 UTC / ~2 AM Manila). It removes obsolete cron entries at `/api/cron/database-backup` or `/api/cron/backup` while preserving other cron entries. The frequency dropdown still determines whether each daily trigger runs a backup.

It fixes `.gitignore` to use `/backups/` rather than `backups/` so the API route is committed to Git. It does not change client data, backup archives, storage credentials, or the saved frequency.

If the script says `Active application files still depend on the old scheduler`, **do not force-delete anything**. That file needs migration first; share the named file's code.

## Stage and deploy

```bash
git add -A
git status --short
git commit -m "Remove legacy backup routes and fix managed cron"
git push origin HEAD
```

Check that `app/api/backups/route.ts`, `app/api/cron/daily-backup/route.ts`, and `vercel.json` appear in the pushed commit. Test manual backup history and the schedule selector on Vercel after deployment.

## Limitations

The patch has no database migration and requires no new environment variables. It does **not** configure missing `SUPABASE_SERVICE_ROLE_KEY`, `BACKUP_ENCRYPTION_KEY`, or `CRON_SECRET` in Vercel. Full project typecheck and build must run on your machine.
