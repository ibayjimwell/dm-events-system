# DM Events — Simple manual backup (no card required)

This replaces the old GitHub Actions + Cloudflare R2 setup. It does **not** require opening a new account, entering a credit/debit card, connecting GitHub, creating an encryption token, or configuring Cloudflare.

## What changes

- **Administration → System Settings → Download Backup** has a **Download backup** button.
- **POST /api/backups** creates a compressed `.json.gz` snapshot. `GET /api/backups` reports manual availability. Both require an authenticated user with `backups.manage`.
- No automatic scheduler, remote storage, or successful-backup history is presented; a download does not mean a durable second copy exists.
- Old GitHub backup workflow, `/api/cron/backup`, and R2 dispatch code should be removed by the included patch script.
- Existing tables, booking flows, messages, access control, Cloudinary and other features remain unchanged. **No SQL migration is needed.**

## What exactly is saved?

The file is a consistent, read-only snapshot of **data rows in all regular PostgreSQL tables in `public`**, including booking requests, packages, staff and clients, permissions, messages, feedback, transaction/analytics source records, and audit entries. Data values are preserved as PostgreSQL-generated JSON text to avoid JavaScript number precision loss. The envelope includes a SHA-256 integrity checksum and counts.

**Not included:** table creation SQL, Drizzle migration history in other schemas, PostgreSQL roles, managed Supabase Auth/Storage, Cloudinary image binaries, Vercel environment variables, or source code. Keep your project source, migrations, and external media safe separately. **This is not a full `pg_dump`.**

## Use in the website

1. Log in as an account explicitly granted `backups.manage` (Mother Admin always has full access).
2. Open **Administration → System Settings → Download Backup**.
3. Click **Download backup**, confirm, then allow your browser to save `DM-Events-Backup-YYYY-MM-DD_....json.gz`.
4. **Verify the file exists** in Downloads. Move it to a private/encrypted folder and retain a second secure copy.
5. Repeat before every database migration or major release, and regularly while in use.

The backup contains personal information, message content and password hashes. Never upload it to GitHub, expose it publicly, or send it to someone untrusted. Avoid storing the backup forever if it contains records that must be deleted under your privacy/retention policy.

## Optional local backup (for a larger database)

Use a trusted laptop/desktop with Node.js and project source and an existing `DATABASE_URL` in `.env.local` or `.env` (prefer a direct or session-pooler PostgreSQL connection for consistent multi-query snapshots):

```bash
npm ci
npm run backup
```

The default web limit is about **18 MiB uncompressed payload, 4 MiB compressed response, 20,000 rows per table and 80,000 total rows**, to avoid hanging serverless requests. The local script allows **100 MiB uncompressed payload, 100,000 rows per table and 500,000 total rows**. For databases beyond that, use an administrator-operated PostgreSQL native backup process instead; do not increase Vercel memory/time without capacity testing.

The `backups/` folder is gitignored. Each output is created with restrictive permissions (where the operating system supports them). You can change the directory with `LOCAL_BACKUP_DIR`.

## Verify an existing file

```bash
npm run backup:verify -- "backups/DM-Events-Backup-YOUR-FILE.json.gz"
```

This checks format, table/row counts, and the embedded SHA-256 checksum. It does not test whether a restore succeeds or whether Cloudinary media has been preserved.

## Restore **ONLY** into a separate EMPTY database

The app **never** overwrites production from the browser. To validate recovery:

1. Create a **separate empty test PostgreSQL database**, using a different database/host from the live `DATABASE_URL`.
2. Back up your live source code and migration files. Apply the same schema/migrations to that **empty** database using `MIGRATION_DATABASE_URL` explicitly set to the test target. Do not run migrations against production by mistake.
3. Set a separate `RESTORE_DATABASE_URL` pointing to the test database (never `NEXT_PUBLIC_*`). Keep the live `DATABASE_URL` defined so the script can reject an identical source/target.
4. Run:

   ```bash
   npm run restore -- "backups/DM-Events-Backup-YOUR-FILE.json.gz" RESTORE-TO-EMPTY-DATABASE
   ```

5. Verify real data, counts, roles, login, bookings and messages in the test environment. Backed-up sessions and historical message records can become stale; revoke sessions if promoting a recovered database.

The script refuses a nonempty target and attempts all inserts in one transaction. Nullable cross-table foreign keys are relinked in a second pass. More complex schemas (circular mandatory constraints, new migrations with incompatible changes, triggers, external relations) may require a custom recovery plan. **Do not use this script to automatically replace the live database.** If testing or restore fails, keep the existing live database unchanged.

## Limitations to understand

- **Manual only:** no automatic daily backups, no cloud storage or download history. A successful API request is not proof that the browser finished writing a file.
- **Not automatically encrypted:** `.json.gz` is compression, not encryption. Protect it using an encrypted drive or encrypted archive before copying it to other devices.
- **Data-only:** external files and managed non-public schemas are not included. You must keep the matching source/migrations.
- **Small datasets:** browser exports run within a Vercel request and can hit platform timeouts, data limits or memory limits. Use the local backup command if that occurs.
- **Privacy:** recovered backups could reintroduce previously deleted conversations and other records. Review legal retention and deletion obligations before recovering an old snapshot.
