# DM Events (7): Filled calendar dates, minimum PHP 5,000, chat archive/deletion

This is a **changed-files-only patch** for the exact `DM Events(7).zip` baseline. It contains full files, not snippets. Do not install it over an older DM Events version without reconciling changes.

## Install

1. Back up your database (and application project) **before** migrating. The migration permanently changes legacy budget and booked-value fields.
2. Unzip this archive into the project root, preserving paths and overwriting only included files.
3. Run `npm ci`, `npm run db:migrate`, `npm run typecheck`, `npm run build`, and restart/redeploy.
4. In the Supabase SQL Editor, rerun `supabase/enable-realtime.sql` to subscribe the two new message-state tables to realtime. The migration can be applied without this step but cross-user archive/deletion updates will otherwise rely on refresh instead of live notification.
5. Configure **daily retention** (instructions below). Without the scheduler, deleted chats cannot be guaranteed to purge after 30 days.

## Schedule permanent deletion

- Generate a new secret, for example `openssl rand -hex 32` (64 hexadecimal characters).
- Set `MESSAGE_RETENTION_SECRET` to that string in your application's **server-side** `.env.local` and Vercel Environment Variables; redeploy. A previously configured `CRON_SECRET` of at least 32 characters is also accepted.
- Configure GitHub Actions repository **Secrets and variables → Actions**:
  - `DM_MESSAGE_RETENTION_URL`: your deployed HTTPS origin plus `/api/cron/message-retention`, for example `https://your-own-domain.example/api/cron/message-retention`.
  - `DM_MESSAGE_RETENTION_SECRET`: the *same* secret used for `MESSAGE_RETENTION_SECRET` in the deployed Next.js application.
- Enable scheduled workflows in GitHub Actions and optionally test `DM Events - Purge deleted messages after 30 days` using **Run workflow**. Check that it returns a result similar to `{"checked":0,"purged":0,"failed":0}`. The schedule runs daily (best effort, not at an exact minute). You can use any trusted daily HTTP scheduler in place of GitHub Actions.
- Failed deletions are **retried next run**; Cloudinary deletion failures leave messages in the database, still inaccessible in the app. Monitor logs and the JSON `failed` counter. A backlog over 10 chats might take several days; invoke the cron repeatedly or increase processing cadence until caught up. Retention is therefore **eligible after 30 days**, not a hard guarantee of exact-time erasure.
- A chat is deleted **for all participants** when any authorized admin/coordinator selects Delete and confirms. All participants lose messaging access to that booking immediately. Admins/coordinators can restore it from **Recently deleted** before day 30. Clients can **Archive** only, and archives affect only the person's inbox. Incoming messages automatically unarchive the thread.
- On purge, messages, reads, typing states, personal chat folder preferences and linked message images are deleted from the active database; Cloudinary message files are destroyed, leaving a content-free deletion tombstone. **Booking details, history, financial entries and audit metadata are not deleted.** Offsite backups, emails already sent, or third-party copies might retain earlier information under their own retention policies.

## Budget migration and reporting

- All future client and walk-in booking requests must have an estimated budget of **PHP 5,000 or more**. Validation runs in the UI and on the server, and a database constraint blocks under-minimum direct writes.
- Staff agreed values must be either **unset** (except when the booking is Confirmed) or **PHP 5,000 or more**. A Confirmed event must have a recorded agreed value of at least PHP 5,000.
- Existing `bookings.estimated_budget` under PHP 5,000, plus legacy non-numeric values, are replaced by `5000.00`. Existing `bookings.booked_value` under PHP 5,000 is similarly raised. Missing Confirmed values are set to PHP 5,000. Review these records with clients: a migration cannot establish that their historical agreed budgets actually changed.
- Historic `booking_value_events` are **not overwritten**; dated correction entries are added for active Confirmed bookings. Financial analytics show movements and cancellations and can legitimately include individual adjustment deltas smaller than PHP 5,000 or a net zero/negative month. The *current agreed booking amounts*, not every partial ledger movement, meet the minimum policy. Reports are commitments, not payments or revenue.
- An administrator can review changed rows by comparing a pre-migration backup with the current data.

## Calendar behavior

Whole date cells are filled: **green confirmed**, **blue held**, **amber tentative**, **red cancelled**. When multiple statuses occur on the same date, Confirmed takes priority, then Held, Tentative, Cancelled. The exact number and statuses are still visible in the selected-date details.

## Verification

`node --test tests/*.test.cjs`: **173/173 source regression tests passed**. Changed TypeScript/TSX modules passed parsing checks. The npm dependency install failed in the test environment, so production `npm run typecheck`, `npm run build`, and live Supabase migration were **not** verified; complete those checks in your deployment environment.
