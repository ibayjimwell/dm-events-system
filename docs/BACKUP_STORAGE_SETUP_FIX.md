# Database Backup — storage configuration fix

The warning “Backup storage is unavailable” was caused by the previous status check returning only `configured: false` when one of the required environment variables was absent. The page now identifies which setting is missing, and the backup storage client accepts both newer Supabase server secret keys and legacy service-role keys.

## Apply

1. Extract the patch ZIP in the DM Events project root, preserving the internal paths.
2. In `.env.local` (development) and **Vercel → Project → Settings → Environment Variables** (deployed application), set:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
# Use a Supabase secret key under Project Settings → API Keys.
SUPABASE_SECRET_KEY=YOUR_SUPABASE_SERVER_SECRET
# Or use your existing legacy SUPABASE_SERVICE_ROLE_KEY instead.
BACKUP_ARCHIVE_KEY=YOUR_SAVED_64_CHARACTER_HEX_KEY
```

Use `openssl rand -hex 32` to generate `BACKUP_ARCHIVE_KEY` **only if you do not already have one**. Existing archives are encrypted using the original key. Changing that key makes older stored backups unreadable. Copy the existing key from your deployment if it was previously set. Do not post the values in chat, screenshots, or source code. `SUPABASE_URL` may alternatively come from an existing `NEXT_PUBLIC_SUPABASE_URL`. `SUPABASE_SECRET_KEY` may alternatively be supplied through the existing legacy `SUPABASE_SERVICE_ROLE_KEY`. A public/publishable/anon key cannot administer backups.

3. Run `npm run backup:diagnose`. It checks the environment and contacts Supabase without printing the keys.
4. Optionally run `npm run backup:diagnose -- --initialize` to create the private `dm-events-database-backups` Storage bucket now. Otherwise, the application creates it on the first backup request.
5. Run `npm run typecheck && npm run build` and deploy the updated application. **Restart the development server** after editing `.env.local`. Vercel requires redeploying after changing environment variables.
6. Refresh **Administration → System Settings → Database Backup**, create a test archive and download it.

If `npm run backup:diagnose` fails with a connection error, verify the server key in the Supabase dashboard **Project Settings → API Keys** and confirm your project's Storage service is healthy. If the bucket already exists and is public, make it private; backups must never go to a public bucket.

Automatic backups separately require `CRON_SECRET` and a deployed scheduled endpoint. This fix does **not** disable existing schedules, change database tables, or delete any prior backups.

## Security

Never prefix `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `BACKUP_ARCHIVE_KEY`, or `CRON_SECRET` with `NEXT_PUBLIC_`. The backup files include personal data and password hashes; Supabase's server secret can bypass row-level security and must remain server-only.
