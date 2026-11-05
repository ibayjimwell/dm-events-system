# DM Events — automatic backups with backup history (Vercel + Supabase Free)

This replacement keeps the existing **database-only** `.json.gz` export format and the local verification/restore scripts. It adds encrypted automatic backups, manual "Create backup", a persistent file history, metadata inspection, download, delete, and a seven-snapshot automatic retention policy. It requires **no Cloudflare R2, GitHub Actions backup runner, or separate credit-card-backed subscription**.

## Where backups are actually saved

The automatic/manual snapshots are encrypted with AES-256-GCM **on the Next.js server** and uploaded to a **private Supabase Storage bucket** named `dm-events-private-backups`. Listing and management use the Supabase Storage API. Files survive Vercel redeployments; the Vercel filesystem is not used for persistence.

**Important limitations:** this is data from the PostgreSQL `public` schema only, not SQL DDL, Cloudinary media, Supabase Auth or external files. A snapshot living in Storage inside the **same Supabase project** is NOT independent disaster recovery. Regularly download off-platform copies. The data is bounded by the project's existing web-export size limits. Backups can fail on large databases, on insufficient Vercel function time, or on quota exhaustion. The Free plan has usage limits.

## Install the patch

1. Keep a safe copy of your existing system and database. Extract the patch into your existing repository, replacing only the supplied files.
2. Run `node scripts/configure-managed-backup.mjs` **before committing**. It merges the backup cron into any existing `vercel.json`, preserving other cron jobs. It also repairs an unanchored `backups/` ignore rule if found.
3. Generate two independent secrets:
   ```sh
   openssl rand -base64 32  # BACKUP_ENCRYPTION_KEY, 44 characters
   openssl rand -hex 32     # CRON_SECRET
   ```
4. In **Vercel → Project → Settings → Environment Variables → Production**, configure:
   - `DATABASE_URL` (already used by DM Events)
   - `SUPABASE_URL` (same project as the app)
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only key, NEVER `NEXT_PUBLIC_`)
   - `BACKUP_ENCRYPTION_KEY` (base64 from above; store securely offline)
   - `CRON_SECRET` (32+ random characters; never reuse the encryption key)
5. Run `npm ci && npm run typecheck && npm run build`. Commit/push `vercel.json`, `.gitignore` (if changed), all route files, and the other patch files to the Vercel Production branch.
6. Check tracked files:
   ```sh
   git check-ignore -v app/api/backups/route.ts app/api/backups/file/route.ts app/api/cron/daily-backup/route.ts
   git ls-files app/api/backups/route.ts app/api/backups/file/route.ts app/api/cron/daily-backup/route.ts vercel.json
   ```
   `git check-ignore` must produce **no matching ignore rule**. After staging/committing, `git ls-files` must print all four paths.
7. Redeploy production. In Vercel → Cron Jobs, confirm `/api/cron/daily-backup` is registered. It runs every day at **18:00 UTC** (approximately **02:00 Philippine time the following day**). On Hobby, exact minute execution is not guaranteed.

## First-time use

- Sign in with an account granted `backups.manage`.
- Go to Administration → System Settings → Backup Center.
- Click **Create backup**. The bucket is created automatically on first use as **private**, and the encrypted archive is stored there.
- In **Backup history**, **View** verifies the archive's checksum and shows its table/row counts, **Download** provides the normal `.json.gz` file, and **Delete** removes the selected stored copy permanently.
- Never share the unencrypted download in an email, public bucket, or Git repository; it contains personal data and account password hashes.
- If the bucket already exists with `public: true`, the feature refuses to use it. Change it to private.

## Scheduling and monitoring

- Vercel uses `vercel.json` to call `/api/cron/daily-backup` as a GET request with `Authorization: Bearer <CRON_SECRET>`. No session is used for this schedule.
- Automatic runs use a stable path per UTC day, so retries are idempotent. New automatic snapshots are verified before upload. After a **successful** upload, only the newest 7 automatic copies are retained. Manual copies are never auto-pruned.
- The status page warns when there has not been a successful automatic backup in 48 hours. Inspect **Vercel → Cron Jobs → View Logs** when a job fails. Vercel does not guarantee retries.
- Supabase Free storage has quota limits; monitor project usage. The Backup History currently lists at most 100 automatic and 100 manual objects; remove old manual backups as needed.
- Because the Storage bucket is in the same Supabase project, deleting that project or losing project access may destroy both live data and backups. Download verified copies to an encrypted external device at least weekly and before migrations.

## Verify and recover

The web **View** button decrypts the archive and verifies its SHA-256 checksum. It **does not test SQL restore**.

Download a file and run:

```sh
npm run backup:verify -- /path/to/DM-Events-Backup-....json.gz
```

The existing `scripts/restore.ts` supports **a separate, empty staging database only** and has deliberate safety checks. Keep source code and Drizzle migrations in Git so that the schema can be rebuilt. Do not run arbitrary restores against the live database.

## Troubleshooting

- **404 on `/api/backups`:** make sure the `app/api/backups/route.ts` route is tracked; `.gitignore` must contain `/backups/`, not `backups/`.
- **401 on cron route:** expected without the `Authorization: Bearer` secret. Vercel automatically sends it when `CRON_SECRET` is set in the Production environment and the deployment is current.
- **503 on backup creation:** verify Supabase URL/service-role key, Storage permissions, and encryption key. Inspect Vercel logs for the underlying error.
- **Automatic backups absent after deployment:** check Vercel Cron Jobs registration, the `vercel.json` file in the *deployed* commit, and environment settings. Automatic jobs run on Production, not Preview.
- **Backup fails because of size/time:** this small-project exporter has explicit bounds. Use a trusted `pg_dump`/local database backup for a larger project instead.
- **Archive can't be decrypted:** use the exact original `BACKUP_ENCRYPTION_KEY`. Changing that key makes earlier archives inaccessible. Decrypted `.json.gz` downloads still work with the local verification tools.
- **Supabase pauses or the project is deleted:** same-project backups can become inaccessible. Offline copies are essential.
