# DM Events — Event Booking & Management

A full-stack, responsive Next.js App Router website based on the attached 57-page **DM Events Complete Transaction POV Prototype**. It implements the public website, client, coordinator, and administrator portals and the 27-step transaction narrative. UI colors, condensed typography, hero venue photograph, form layout, cards, and mobile breakpoints follow the reference. No iPhone mockup/frame is used: this is a responsive website.

## Architecture

| Concern | Implementation |
|---|---|
| Web UI and server API | Next.js 16 App Router, React 19, TypeScript |
| Styling | Tailwind CSS 4 + shared design tokens in `app/globals.css` |
| Database | Supabase-hosted PostgreSQL, accessed exclusively from Next.js using Drizzle ORM / postgres.js |
| Migrations | Drizzle Kit versioned migration SQL and `drizzle/meta` baseline snapshot |
| Identity | **Custom `public.users` and `public.sessions`**, bcrypt password hashes, 256-bit random session tokens hashed before persistence, HTTP-only SameSite cookie |
| Roles | Client / Coordinator / Admin; checks on server layouts **and every protected API handler** |
| Realtime | Supabase Realtime Postgres Changes over a **server-side** service-role subscriber, forwarding only filtered invalidation events over authenticated SSE (client reloads via authorized API) |
| Images | Cloudinary; type-checked on server with Sharp, randomized filenames. Inspiration/message images use authenticated delivery, proxied only after Next.js access checks. Package/hero assets are public if published. |
| Recovery/verification | Resend email with short-lived hashed single-use tokens; verification is configurable |
| Backups | Optional PostgreSQL custom dump of `public` + `drizzle` schemas, encrypted AES-256-GCM, off-site S3-compatible storage, audit history, manual trigger, cron endpoint, explicitly confirmed CLI restore |

Supabase Auth (`auth.users`) is **not** used. Never put a Supabase `service_role` key, PostgreSQL password, Cloudinary secret, or Resend key into frontend code or a `NEXT_PUBLIC_` environment variable.

## 1. Prerequisites

- Node.js **22+** and npm.
- A dedicated **Supabase** project with an active PostgreSQL database, database password and service-role key.
- A **Cloudinary** account with cloud name, API key and API secret.
- A sender domain configured in **Resend** if using password recovery/email verification (recommended for production).
- For off-site backups: PostgreSQL client utilities `pg_dump` / `pg_restore`, S3-compatible object storage (e.g. R2/S3), AES backup key and a trusted external cron scheduler.

**The ZIP contains no credentials or live Supabase project.** You must provision the external accounts and set your own `.env` before using live data. It cannot connect to your project automatically without those secrets.

## 2. Installation and Supabase configuration

```bash
npm install
cp .env.example .env
# Edit .env with your own real credentials
```

Use Supabase **Database > Connect** to get the pooled connection URL for `DATABASE_URL`. Use the direct connection or **session pooler** (port typically 5432) for `MIGRATION_DATABASE_URL`. The transaction pooler (often port 6543) is suited to Next.js queries but should not be used for migrations, `pg_dump` or `pg_restore`. URL-encode any special characters in your database password.

Required environment variables:

```dotenv
DATABASE_URL=postgresql://...
MIGRATION_DATABASE_URL=postgresql://...
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
APP_URL=http://localhost:3000
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
SESSION_COOKIE_SECURE=false
EMAIL_VERIFICATION_REQUIRED=false
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=use-a-unique-strong-password
```

Set `EMAIL_VERIFICATION_REQUIRED=true`, `SESSION_COOKIE_SECURE=true`, HTTPS `APP_URL` and `RESEND_API_KEY`/`MAIL_FROM` for production.

## 3. Database migrations and Realtime

```bash
npm run db:migrate
```

This applies the versioned `drizzle/0000_initial.sql` tables and `drizzle/0001_security.sql` which enables RLS and revokes all direct `anon`/`authenticated` Data API permissions. Next.js accesses the database using its private database connection; the Realtime service key is kept server-side. Do not create permissive Supabase RLS policies for these private tables; the browser uses Next.js routes rather than Supabase Data API.

In your **Supabase SQL Editor**, run `supabase/enable-realtime.sql` to add bookings, booking history, messages, packages and site content to the `supabase_realtime` publication. Enable Realtime in your Supabase project settings. This SQL script is intentionally separate from the Drizzle migration because standard local PostgreSQL does not have the Supabase publication.

For future schema changes, modify `src/db/schema.ts`, run `npm run db:generate`, inspect the generated SQL, and run `npm run db:migrate`. The checked-in `drizzle/meta/0000_snapshot.json` provides the initial diff baseline; do not rewrite or delete already-applied migrations on an existing database. The included snapshot generator is provided for reviewing the initial baseline and should not normally be run on an evolved schema.

## 4. Create the first administrator and package placeholders

```bash
npm run seed
npm run dev
```

Then visit **http://localhost:3000** and sign in using `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.

The seed creates only the first admin if the email does not exist and adds clearly labeled, **unquoted placeholder** package records (the PDF explicitly states package names/prices are placeholders). Edit/publish real packages at **Admin > Maintenance > Manage packages** before advertising services. Re-running seed does not overwrite an existing admin password.

The admin creates coordinator accounts from **Maintenance > User access**. Public registration always creates the **CLIENT** role; coordinator/admin pages and APIs reject client access. For the initial staff password, use a randomly generated unique password and share it through a secure channel; staff can change it via password recovery.

## Role navigation and capabilities

| Public | Client | Coordinator | Administrator |
|---|---|---|---|
| `/` Homepage | `/client` Dashboard | `/coordinator` Dashboard | `/admin` Overview |
| `/packages` List | `/client/book` Two-step request | `/coordinator/calendar` Color calendar | `/admin/analytics` Confirmed booking value |
| `/packages/[id]` Detail | `/client/bookings` Track | `/coordinator/requests` Reviews | `/admin/bookings` All booking reviews |
| `/login` / `/register` | `/client/bookings/[id]` Preferences/cancellation | `/coordinator/requests/[id]` Status & notes | `/admin/messages` Read-only oversight |
| `/forgot-password` / `/reset-password` | `/client/messages` Conversation + images | `/coordinator/messages` Conversations | `/admin/maintenance` Catalog, content, users, system, backups |
| `/privacy` | `/client/profile` Contact info | | |

**Booking lifecycle:** client submission creates `TENTATIVE`; an authorized coordinator/admin can move it to `HELD` or `CONFIRMED` after reviewing details and any date overlap, or `CANCELLED`. A status history row, actor, timestamp and audit entry are recorded. Clients request cancellation, rather than automatically cancelling an event. The calendar shows text as well as colors for tentative/yellow, held/blue, confirmed/green, cancelled/red. An explicit conflict override is logged. `booked_value` must be greater than zero for confirmation, but the application **does not charge or collect payments**.

**Reporting:** `Analytics` groups the booked value of currently confirmed bookings by `confirmed_at` in **Asia/Manila**. The current month is marked provisional; it can be finalized beginning the first day of the next month. CSV export includes confirmed records only, with formula-injection-safe escaping. It is not a real cashflow, revenue, or profit report. Confirm the reporting-month interpretation with DM Events.

**Scope exclusions from the PDF:** no staff assignment, staff duties/tasks, payment processing, expense/profit accounting, separate native iOS app, or automatic booking acceptance.

## Upload safety

- Client booking inspiration and message images: JPEG, PNG or WebP; **maximum 1 MiB** per image.
- Admin package and hero images: same formats; up to **5 MiB**.
- Sharp validates actual image content (not only the filename or HTTP MIME header). Filenames are randomized on the server.
- Private images are uploaded as Cloudinary `authenticated` delivery assets. `/api/assets/[id]` checks logged-in actor, owner, and booking access before fetching through a signed Cloudinary URL. Never expose unrestricted direct URLs for private media.
- The client must acknowledge the public privacy policy before registering and submitting an event inquiry. DM Events **must replace/review** the provisional policy before any real-user production launch.

## Email setup

Set `RESEND_API_KEY` and `MAIL_FROM` using a verified sender domain. The Forgot Password form sends a hashed, single-use reset token (30-minute expiry); password reset revokes all active sessions. Set `EMAIL_VERIFICATION_REQUIRED=true` to require one-time email verification before sign-in. This is strongly recommended for production; when false, registration immediately creates a session for easy development testing. Email verification and recovery cannot send emails until a real provider is configured.

## Production Realtime

On the server, `/api/events` creates a Supabase Realtime `postgres_changes` subscription using the **service-role key** and delivers **only a `{kind}` invalidation message** over same-origin, session-protected SSE. For client sessions, booking/message change events are filtered by booking ownership; no database rows or secrets go to the frontend. The browser re-fetches through access-controlled Next.js APIs. It reconnects on dropped SSE connections and refreshes on focus.

**Deployment caveat:** this SSE approach works best on a persistent Node.js host that supports long-lived connections (e.g. VPS/Docker). Serverless platforms with short streaming function limits can terminate connections and cause reconnection churn. For larger traffic, replace per-connection subscriptions with a shared event broker or private Supabase Broadcast with correctly implemented custom JWT/RLS; do not expose service-role credentials to the browser.

## Automatic encrypted backups and restoration

Optional `.env` variables:

```dotenv
BACKUP_S3_BUCKET=my-private-backups
BACKUP_S3_REGION=auto
BACKUP_S3_ENDPOINT=https://ACCOUNT.r2.cloudflarestorage.com
BACKUP_S3_ACCESS_KEY_ID=...
BACKUP_S3_SECRET_ACCESS_KEY=...
BACKUP_ENCRYPTION_KEY=64_lowercase_hex_characters_from_a_secure_random_generator
BACKUP_CRON_SECRET=random-long-secret
```

To generate the encryption key, use:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Backups run **only when invoked**. Enable the policy in Admin > Maintenance > System settings, then schedule a daily POST to `/api/cron/backup` using `Authorization: Bearer <BACKUP_CRON_SECRET>` from a trusted external scheduler (or run `npm run backup` as a system cron job). `npm run backup` and Admin > Backup & restore also create on-demand backups. `pg_dump` must exist on the machine. Backup statuses are real database records; failures appear as FAILED, not fictitious successes. The code uses a 100-MiB output bound and should be upgraded to streamed/multipart backups for larger databases.

Each dump contains the `public` and `drizzle` schemas, **not the managed Supabase `auth` or `storage` schemas**; the bytes are encrypted with AES-256-GCM before uploading to an off-device S3-compatible private bucket. Configure Cloudinary separately for image retention/export; Cloudinary assets are not in PostgreSQL dumps. Test backups and restore procedures on a **staging project** before production.

To restore a known successful backup, an authorized operator in a maintenance environment must set `ALLOW_DESTRUCTIVE_RESTORE=YES` and `RESTORE_APPROVED_BY`, then:

```bash
ALLOW_DESTRUCTIVE_RESTORE=YES RESTORE_APPROVED_BY=admin@example.com npm run restore -- BACKUP_UUID RESTORE-BACKUP_UUID
```

This is intentionally **not a destructive browser button**. The command checks an exact confirmation phrase, decrypts the off-site backup and runs `pg_restore --clean --if-exists`, then writes an audit record. Make a fresh backup, lock user access, and test this flow first; it can replace live data.

## Source organization

```text
app/
  (public)/                    # homepage, packages, auth, privacy
  (portal)/client/             # client dashboard, wizard, bookings, messages, profile
  (portal)/coordinator/        # calendar, reviews, messages
  (portal)/admin/              # analytics, bookings, maintenance
  api/                         # server-authenticated API route handlers
src/
  db/schema.ts                 # tables, enums, FKs, indexes, relationships
  db/index.ts                  # PostgreSQL/Drizzle connection
  models/read.ts               # database read models and authorization
  lib/                         # auth, validation, error handling, Cloudinary, backup
  api-client/                  # frontend typed fetch wrapper
  hooks/useLiveQuery.ts        # realtime-aware client refresh hook
  connections/realtime.ts     # SERVER-ONLY Supabase realtime connection
  components/ui/              # panels, stat cards, fields, status pills
  components/{shared,client,coordinator,admin}/
    ...                        # reusable feature components
scripts/                       # administrator seed, encrypted backup, restore, snapshot helper
drizzle/                       # tracked SQL migrations, journal, baseline snapshot
supabase/enable-realtime.sql  # one-time Supabase publication setup
public/images/                # Venue photograph and DM logo extracted from supplied PDF
```

## Verification checklist

After configuring real services, use **one client + one coordinator + one admin** to verify the workflow: register, verify email (if enabled), login, browse package, submit request with a valid 1-MiB-or-less inspiration file and consent, receive Tentative reference, see it on coordinator dashboard/calendar, update Held and Confirmed with booked value, send private messages both directions, request cancellation, mark Cancelled, review status history, and confirm that admin analytics include only currently confirmed bookings. Also test wrong-role URLs, API permission failures, password reset, file validation, mobile widths, editing packages, and encrypted backup/restore on staging.

### Important limitations

This repository was generated without access to your cloud credentials or an online npm registry. The source and migrations are included, but **the live Supabase database, Cloudinary uploads, email delivery, full dependency install, Next.js production build, and browser end-to-end tests have not been executed here**. You must run `npm install`, migrations, seed, `npm run typecheck` and `npm run build` in an environment with package registry access, then fix any environment/version-specific issues before treating it as production-ready. The supplied PDF is a visual prototype and its placeholder values are intentionally not used as real bookings or revenue.

## Docker deployment (optional)

The included `Dockerfile` builds the Next.js standalone server. It intentionally does not start PostgreSQL locally; Supabase remains the database. Run migrations and seed on a trusted machine before starting the container.

```bash
docker build -t dm-events-web .
docker run --rm -p 3000:3000 --env-file .env dm-events-web
```

Use an HTTPS reverse proxy and `SESSION_COOKIE_SECURE=true` in production. The minimal runtime container does not include `pg_dump`/`pg_restore`; schedule backups from a separate trusted operator host with PostgreSQL tools and S3 access, or extend your container image responsibly. See `docs/TRANSACTION_MATRIX.md` for the exact mapping of all 27 PDF steps.

## Cloudflare R2 database backups and Analytics CSV

See [CLOUDFLARE_R2_SETUP.md](./CLOUDFLARE_R2_SETUP.md) for exact Cloudflare, GitHub Actions, Vercel, encryption, verification and restore steps. The Admin backup button queues a GitHub Actions job; it does not run `pg_dump` inside Vercel. Analytics exports include a summary, all-month trend, event-type breakdown and detailed movements in one CSV.
