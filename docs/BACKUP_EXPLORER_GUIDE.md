# DM Events — Backup Details & Data Explorer

## What this patch replaces

In the current Backup Center, **View** calls `GET /api/backups/file?action=inspect`, then shows a small metadata panel. This patch replaces that with a scrollable dialog containing operational summaries, a table explorer and recovery guidance.

The patch is designed for the **managed Supabase Storage backup implementation**, after the Daily/Weekly/Monthly schedule and legacy cleanup patches. It does **not** restore Cloudflare R2 or old `backupManager.ts` endpoints.

## Files added or modified (complete files)

1. `src/lib/backupExplorer.ts` — summarizes a verified archive and restricts row previews to an explicit safe-field allowlist.
2. `app/api/backups/file/route.ts` — supports `action=inspect`, `action=records`, verified archive download and deletion.
3. `src/components/admin/BackupExplorer.tsx` — interactive modal with overview, searchable/paginated records and recovery limits.
4. `src/components/admin/Backups.tsx` — opens the explorer from the history View button; preserves create/schedule/download/delete.
5. `tests/backup-explorer.test.cjs` — regression tests including preview privacy, access restrictions, and pagination.
6. `docs/BACKUP_EXPLORER_GUIDE.md` — this guide.

## How to install

1. Back up your project source and ensure the existing automatic backup system is working.
2. Extract the ZIP into the project root (`~/dm-events-system`) with folder paths intact, overwriting the four affected application files.
3. Run:

```bash
npm ci
node --test tests/backup-explorer.test.cjs
npm run typecheck
npm run build
```

4. Commit/push **all four application files and the new test file**, then redeploy Vercel Production.
5. In Backup Center, click **View** for a saved archive. Inspect the Overview, Explore records and Recovery & protection sections.

The `.gitignore` rule must be `/backups/`, **not** `backups/`, so Next.js API routes are tracked. Verify `git ls-files app/api/backups/file/route.ts` after staging.

**No database migration, new secret, storage bucket, cron update, third-party subscription or paid account is required.** Existing `BACKUP_ENCRYPTION_KEY`, Supabase storage settings and permissions remain in place.

## What the explorer shows

- **Overview:** backup filename, export and verification times, public-table/row counts, booking statuses, upcoming confirmed event count, event types, user roles, package publishing, ratings and messages.
- **Value summary:** the aggregate agreed booking values of confirmed/completed records, plus the historical positive, negative and net booking-value ledger changes. These amounts **are not payments received, income or profit**.
- **Explore records:** every archived table is listed with its actual row count. Explicitly approved tables have searchable, paginated read-only rows. This view searches only the fields it displays. Page size is 20 records.
- **Recovery & protection:** snapshot metadata, checksum, restoration caveats, and the recommendation to restore-test on an isolated database.

## Privacy and safety

The server checks `backups.manage` before reading **any** backup content. Each preview request downloads, decrypts and re-verifies the stored archive on the server. It never provides an unprotected storage URL, and API responses have no-store cache headers.

These database tables are counts-only: `auth_tokens`, `auth_limits`, `sessions`, `notification_outbox`, `message_typing`, `system_settings`, and all unknown/new tables. Other tables have an allowlist of fields. Password hashes, session or reset tokens, private chat bodies, full contact phone/email, client special requests, configuration values and unapproved JSON blobs are never served as preview rows. Administrator-accessible business records can still include client display names, venue names and booking references.

This restriction is on the **website preview only**. The downloadable encrypted backup still contains the full captured database contents, including sensitive records, as required for a backup. Store downloaded backups on encrypted media, and rotate credentials if a backup is exposed.

The site does not include one-click production restore, and **checksum verification does not constitute a successful recovery test**.

## Format and service limits

Uses the existing `dm-events-public-data-v1` `.json.gz` backup format, wrapped in AES-256-GCM encryption for private Supabase Storage. It remains a public-schema **data-only** backup. SQL DDL/migrations, Cloudinary original files, Supabase Storage objects and runtime environment secrets are not included. Keep source-controlled migrations separately and perform periodic staging recovery tests.

For the current small project, previewing a page re-downloads a backup and verifies it afresh. For large databases, migrate to a proper PostgreSQL backup/restore service and indexed backup catalog; the existing exporter already has table, row and archive size limits.

## Testing and deployment status

Tested with a synthetic archived dataset and mocked route/storage operations. Focused tests passed **28/28** (8 new explorer tests plus 20 existing managed backup, frequency and manual backup tests). TypeScript AST syntax parsing passed. Full production build, real Supabase archive inspection and live Vercel deployment require verification on your machine.
