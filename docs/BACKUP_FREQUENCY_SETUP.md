# DM Events — backup schedule dropdown & Production environment setup

## What changed

The Backup Center now allows an administrator with the `backups.manage` permission to select **Daily**, **Weekly**, or **Monthly** and click **Save schedule**. The selection persists as a JSON configuration object in the existing **private** Supabase Storage bucket `dm-events-private-backups` and survives Vercel redeployments. No extra vendor, payment method, or SQL migration is required.

The single Vercel cron continues to run once a day at **18:00 UTC**, approximately **2:00 AM the following day in Asia/Manila**. The cron reads the saved frequency before exporting the database:

- **Daily** — every day at approximately 2 AM Manila.
- **Weekly** — Mondays at approximately 2 AM Manila.
- **Monthly** — the first day of every month at approximately 2 AM Manila.

Runs on unselected dates return a successful `skipped: true` response and create **no backup file**. Automatic backups are idempotent within the same day and retain the latest **seven automatic backups**. Manual backups remain until deleted. The Backup Center now checks whether the *last scheduled run* was missed rather than warning merely because the most recent backup is more than 48 hours old.

The stored configuration object uses the location `config/backup-schedule.json` in the same private backup bucket. It is not in the project's static `vercel.json`, so changing the dropdown does **not** require a redeploy.

## Fix the “Backup storage is not ready” warning

Your uploaded local `.env` includes keys named `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, but **does not contain `BACKUP_ENCRYPTION_KEY`**. It contains an unrelated `BACKUP_ARCHIVE_KEY`; do **not** assume that name is interchangeable. The managed-backup encryption format requires `BACKUP_ENCRYPTION_KEY` containing **32 random bytes encoded as base64**. If you already created encrypted managed backups, keep using the exact same original key; do not replace it.

The website runs in **Vercel Production**, which does **not automatically import your local `.env` file**. In Vercel → Project → Settings → Environment Variables, configure these exact names in the **Production** environment:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Existing Supabase PostgreSQL connection string for production |
| `SUPABASE_URL` | Existing Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Private Supabase Storage access for the server (never `NEXT_PUBLIC_`) |
| `BACKUP_ENCRYPTION_KEY` | 32 random bytes encoded in base64 (needed to encrypt/decrypt backups) |
| `CRON_SECRET` | Independent random secret for Vercel's automatic cron requests |

Create a **new** encryption key *only if you have not yet stored any encrypted backups or still have the original key available*. Run locally:

```sh
openssl rand -base64 32
```

Store the generated value securely outside the repository. Add it in Vercel Production. For a fresh cron secret:

```sh
openssl rand -hex 32
```

Use the new cron secret in Vercel Production, not in a public variable. Your `.env` attachment exposed real credentials, so **rotate the exposed Supabase database password, service-role credential if supported, cron secret, notification/email/SMS tokens, Cloudinary API secret, and account passwords** through the respective providers; then update all integrations. Never commit `.env` to Git or share its values in logs.

After saving environment variables in Vercel, **redeploy to apply them**. The app reports missing/invalid variable **names**, not secret values.

## Install the patch

1. Back up your source and database before changes.
2. Extract the patch into your existing DM Events project root, preserving directories.
3. If the latest managed-backup installer has not been run, run `node scripts/configure-managed-backup.mjs`. It adds the **one daily cron** while preserving other Vercel cron jobs.
4. Run `npm run typecheck` and `npm run build`, then commit/push and deploy to **Vercel Production**.
5. **Critical Git ignore check:** keep `/backups/` in `.gitignore`, **not** `backups/` (which can ignore `app/api/backups/`). Verify `git ls-files app/api/backups/route.ts` before deploying.
6. Confirm **Vercel → Cron Jobs** lists `/api/cron/daily-backup`. The default Vercel Hobby plan permits a once-daily invocation and is not exact to the minute.
7. Open **Administrator → System Settings → Backup Center**. Choose Daily/Weekly/Monthly and click **Save schedule**. Refresh the page: the value should persist.
8. Create one manual backup to verify Storage works; then test **View**, **Download**, and **Delete** of a test snapshot.
9. On the next scheduled date, verify a successful automatic entry appears in history; skipped cron calls on other dates are expected.

## Security, costs and limitations

- This implementation reuses your existing Supabase and Vercel services; **no separate credit/debit card is required for this patch**. Provider quotas and plan restrictions still apply.
- Do **not** use Vercel's temporary local filesystem as persistent backup storage.
- This is a *data-only* `public` PostgreSQL export, not a full project, DDL, Cloudinary or Supabase Auth backup. No automatic database restore is offered in the web UI.
- The encrypted key must be retained forever for as long as old snapshots remain; rotating it breaks old backups.
- The daily cron is a check, not a backup when Weekly or Monthly is selected. A missed scheduled day is not automatically retried until the next scheduled occurrence. Use **Create backup** manually if required.
- Backups in the same Supabase project are not independent disaster recovery. Store downloaded archives securely on a separate encrypted device.
