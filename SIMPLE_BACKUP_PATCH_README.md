# DM Events manual backup patch — installation

**Baseline:** the latest shared DM Events (7) source plus Calendar/Budget/Chat, Backup 404, and Completed Booking Feedback changes. Files in this patch contain their **full updated contents**, not excerpts. Extract with overwrite in the project root. This patch does not include credentials or database data.

## Apply

```bash
cd ~/dm-events-system
# Extract DM_Events_Simple_No_Card_Backup_Patch.zip here, preserving folders.
bash apply-simple-backup-patch.sh
npm ci
npm run typecheck
npm run build
npm run dev
```

No SQL migration or new environment variable is required. Leave the current `DATABASE_URL` configured as before. You no longer need `BACKUP_GITHUB_*`, `BACKUP_S3_*`, `BACKUP_ENCRYPTION_KEY`, `BACKUP_CRON_SECRET`, or `BACKUP_STORAGE_KEY` for this feature. Remove unused values from your deployment settings when the old workflow is deactivated, but **do not remove your database credentials**.

**Important:** the Bash script removes the old GitHub backup workflow, cron backup route, R2 dispatch library and old setup documentation. A ZIP extraction alone cannot delete old files. The unrelated **chat retention** workflow remains untouched.

## Use

Log in as the Mother Admin or a user who has `backups.manage`. Go to **Administration → System Settings → Download Backup**, select **Download backup**, and confirm. The browser should save a `.json.gz` file. Check that the file exists and keep a protected copy elsewhere.

Use `npm run backup` for a local backup, `npm run backup:verify -- <file>` to verify, and `npm run restore -- <file> RESTORE-TO-EMPTY-DATABASE` only against a **different empty test database**. See `docs/SIMPLE_NO_CARD_BACKUP.md` for limits, sample commands, and exclusions.

## Security and limitations

- Uses only existing Supabase PostgreSQL connection; no credit/debit card, new account or external backup provider for manual export.
- Manual data-only backup of the PostgreSQL `public` schema, not `pg_dump` of managed schemas or Cloudinary media. Requires original source and Drizzle migrations for recovery.
- Backup files are **not encrypted**. Store them privately and preferably on an encrypted disk.
- No web-based restore or cloud storage; no claimed backup history. Regular manual downloads are your responsibility.
- The backup may be too large for a Vercel request; then use the local CLI instead.
- Actual end-to-end backup against your live Supabase account and a Vercel build must be verified in your environment; automated source and archive integrity checks do not replace them.
