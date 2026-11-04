# DM Events — Database backups and scheduling

This update adds a private archive, history, archive details, download/delete and daily/weekly/monthly scheduling to the existing DM Events admin portal. It uses the Supabase project and Vercel that DM Events already uses. **No new paid account is necessary** as long as the project's use stays within the providers' applicable free allowances.

## Installation (changed files only)

1. Back up the database and code before applying the migration.
2. Extract the patch at the project root and run `bash apply-backup-history-patch.sh` (removes the obsolete `/api/cron/backup` route and cached Next.js route types).
3. Configure the following **server-only** environment variables locally and in Vercel (Project Settings → Environment Variables):
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: existing server credentials for the current Supabase project; not exposed to the browser.
   - `DATABASE_URL`: existing database connection string.
   - `BACKUP_ARCHIVE_KEY`: `openssl rand -hex 32` (64 hexadecimal characters). **Save this key securely. Losing it means existing archives cannot be decrypted.**
   - `CRON_SECRET`: another separate `openssl rand -hex 32` value. Vercel supplies this as `Authorization: Bearer ...` on its cron invocations. Never expose it publicly.
4. Run `npm ci`, `npm run db:migrate`, `npm run typecheck` and `npm run build`. Deploy the latest code to Vercel.
5. Open **Administration → System Settings → Database Backup**, create a test backup, inspect its details and download it. Verify the downloaded file locally with `npm run backup:verify -- ./path/to/file.json.gz` (or `npx tsx scripts/verify-backup.ts ./path/to/file.json.gz`).
6. Set the schedule to **Weekly** or **Monthly** and save. View the next planned run in the dashboard.

### Scheduling

`vercel.json` registers one daily cron check at `16:15 UTC` (00:15 in Asia/Manila the following day). It only creates a backup when the persisted schedule is due:

- **Daily** — next day at approximately 00:15 Philippine time.
- **Weekly** — next Monday at approximately 00:15 Philippine time.
- **Monthly** — first of the next month at approximately 00:15 Philippine time.
- **Off** — no automatic backups.

Cron timing on Vercel Hobby may vary by up to an hour. The scheduled check runs **only in the production deployment**; local `next dev` does not schedule it. If your app is deployed elsewhere, configure an equivalent authenticated daily `GET /api/cron/database-backup` call. The `CRON_SECRET` must appear in the Bearer authorization header. Scheduled requests are checked server-side and claimed atomically; duplicate invocations do not produce duplicate due backups. If a run fails, it is recorded as failed and the next scheduled run is left in place; manually create a backup if immediate recovery coverage is needed.

### Storage and confidentiality

The application creates a **private** Supabase Storage bucket named `dm-events-database-backups` automatically on the first backup. Stored `.dmbackup` files are encrypted with AES-256-GCM. The browser only receives a verified, decrypted gzip archive after server-side `backups.manage` authorization. This file includes confidential account information and password hashes; store it securely. No publicly accessible bucket URL is exposed.

**The bucket and the database live in the same Supabase project**. This protects against accidental record deletion, but it is not a separate-provider disaster-recovery solution. Download copies to a separate encrypted device or a trusted offline location. A project-wide loss could affect both primary data and the stored archives.

The compressed data archive covers ordinary tables in the PostgreSQL `public` schema (within the existing web-export size limits). It does **not** contain the database schema/DDL, Supabase-managed Auth users or storage objects, Cloudinary files, or secret environment variables. Keep your Drizzle migrations and external media separately. Restores still require a safe test database and the existing CLI workflow; this update does not provide a one-click production restore.

History records represent **completed backup creation**, not evidence of a successfully tested restore. Backup creation is limited by the current web exporter (20,000 rows per table, 80,000 total records, 18 MB uncompressed estimate and approximately 4 MB gzip). The private archive upload limit is 5 MB. For larger projects, run and retain a full `pg_dump` outside the web application.

### Retention / deletion

History shows the latest 100 backup attempts. Existing archives are **not automatically deleted**, to avoid silent data loss. Administrators with `backups.manage` may delete an archive through the History table. Monitor storage use and keep an appropriate number of copies. On the Supabase free tier, storage and request quotas apply. If backups reach capacity, downloads of existing backups remain available but new backups may fail until space is freed.

### Security and recovery

- The client never receives Supabase service-role or archive-encryption keys.
- The archive endpoint uses server-side module permissions and validates backup IDs before downloading or deleting.
- The cron endpoint rejects missing or incorrect bearer secrets.
- A backup is marked complete only after it is uploaded to private storage and its metadata is recorded.
- Encrypted archives are authenticated with AES-GCM and downloaded archives are verified with their SHA-256 document checksum.
- Do not share or publish backups; they include private customer data and authentication records.
- Lost encryption keys render all previously stored archives unreadable; maintain a secure recovery copy of the key.

### Troubleshooting

- **Storage unavailable:** check `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `BACKUP_ARCHIVE_KEY` in the running deployment, and verify the service-role key has storage admin privileges.
- **Automatic schedule disabled:** set `CRON_SECRET` in Vercel and redeploy; confirm the Cron Jobs page lists `/api/cron/database-backup`.
- **Missing table errors:** apply `drizzle/0013_backup_history_schedule.sql` using `npm run db:migrate`.
- **Archives fail:** check application logs, project storage limits, and the existing web export size restrictions.
- **Wrong count or unexpected file:** verify downloaded snapshots locally and test restore into a separate database.
