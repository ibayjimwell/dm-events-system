# Database Backup — encryption-key configuration repair

## Why the error occurs

The archive history system uses the server-only variable `BACKUP_ARCHIVE_KEY`, containing **exactly 64 hexadecimal characters**. The older `BACKUP_ENCRYPTION_KEY` from the previous backup implementation is not the same variable. A backslash after an otherwise valid key is an extra character, making validation fail. The DM Events (9) uploaded source had `.env` but did not contain the new `BACKUP_ARCHIVE_KEY` or `CRON_SECRET` names.

The key is deliberately **not** cleaned silently inside the encryption implementation, because changing how encryption keys are interpreted could make stored archives impossible to decrypt. The configuration repair command handles one clearly accidental trailing backslash and leaves other invalid keys untouched.

## Local repair

1. Preserve a secure copy of any **existing** working `BACKUP_ARCHIVE_KEY` before making changes. If there are stored archives, you must retain the original key to decrypt them. Do not generate a replacement key for existing archives.
2. Install the patch in the project root.
3. Run `npm run backup:configure`. The command reads `.env` and `.env.local` (using Next.js-style precedence) and writes valid values into a private `.env.local` file. It preserves valid keys, corrects exactly one accidental trailing backslash or extra whitespace, and generates missing values. It does not print secret contents or change the original `.env`.
4. Run `npm run backup:diagnose`. It reports formatting problems and checks the Supabase private bucket. To create a missing bucket, run `npm run backup:diagnose -- --initialize`.
5. Restart the development server: `npm run dev`. Test **Database Backup → Create backup** and check that a new entry appears in Backup History.

If the repair tool reports an **exported environment override**, remove the stale exported variable (`unset BACKUP_ARCHIVE_KEY`), or update the value at the process manager or hosting provider. Existing exported environment variables override `.env.local`.

## Production (Vercel or other hosting)

`.env.local` remains on your machine and is not automatically deployed. Under the hosting project's server-side environment variables, set `BACKUP_ARCHIVE_KEY` and `CRON_SECRET` to the same values as the working local configuration. Do **not** prefix either name with `NEXT_PUBLIC_`. Redeploy after updating them. The `CRON_SECRET` authorizes scheduled backup requests; the `BACKUP_ARCHIVE_KEY` encrypts and decrypts stored archives. Avoid changing a key that encrypted existing backups.

The two values previously posted in the conversation should be treated as exposed. If they have not encrypted any backups, generate replacements. If previous archives use an exposed key, preserve it long enough to decrypt and migrate/recreate the backups securely, then rotate the key.

## Notes

- Backup archives are stored in private Supabase Storage; the private server secret and project URL must also be configured.
- `.env.local` is gitignored, contains confidential credentials, and must never be committed or included in a patch ZIP.
- `npm run backup:configure` repairs local configuration only; it does **not** migrate existing encrypted archives or change production deployment settings.
- To check whether the route is deployed, run `node scripts/check-backup-route.mjs http://localhost:3000`.
