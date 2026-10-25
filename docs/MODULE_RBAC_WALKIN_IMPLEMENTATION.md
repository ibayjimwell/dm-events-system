# DM Events — Module-based RBAC + Walk-in Booking

## Install safely

1. Back up your production PostgreSQL database and working application directory.
2. Apply the ZIP patch **to a copy of your current project**; its contents preserve project-relative paths. Do not replace `.env` or your database with the archive.
3. Merge changes into locally customized files rather than blindly overwriting unrelated modifications.
4. Verify `MIGRATION_DATABASE_URL` points to the intended Supabase PostgreSQL database (prefer the IPv4-compatible Session Pooler).
5. Run `npm install`, `npm run db:migrate`, `npm run typecheck`, `npm run build`, then `npm run dev` (or your usual deployment process).
6. **Do not run `db:push`, reset the DB, or re-seed existing accounts for this upgrade.** The additive migration is `drizzle/0002_module_access_walkins.sql`; `drizzle/meta/_journal.json` and `drizzle/meta/0002_snapshot.json` are updated to match.
7. Verify the SQL Editor shows `user_module_permissions` and the new `bookings.source` and `bookings.created_by` columns. Existing booking rows should have source `ONLINE` and retain their client IDs.

## Core architecture

- Roles (`CLIENT`, `COORDINATOR`, `ADMIN`) remain unchanged.
- `src/lib/permissions.ts`: centralized modules, role defaults, immutable Administrator-only permission, identity-bound client modules.
- `user_module_permissions` table: a per-user `allowed` override (grant/deny). No row means inherit the base role permission. A role change removes that account's individual grants to prevent stale privileges.
- `src/lib/access.ts`: `can()`, `requirePermission()` (API), `pagePermission()` (server pages), and `permissionSet()` (navigation and responsive screens). Authorize each request from the authenticated user loaded from the session, not client-supplied roles.
- `GET/PATCH /api/permissions`: only ADMIN can read/change any overrides. Every update is audited. Other users cannot delegate access, including through direct requests.
- The `users.manage` module remains permanently ADMIN-only. Personal-client actions (own request, own cancellation, etc.) cannot be delegated to staff because they require a real owner account.
- Existing server APIs now enforce permissions for analytics, export, packages, content, settings, backups, calendar, status changes, messages, media upload, and booking operations. UI buttons are permission-aware where applicable.
- Navigation is permission-filtered, including granted cross-portal links. Pages and APIs each enforce access independently.

## Example: Grant a Coordinator Admin Analytics

1. Log in as Administrator.
2. Open `/admin/maintenance/users` (User Access).
3. Select the Coordinator.
4. In Module permissions, set `analytics.view` to **Grant access**.
5. Optionally grant `analytics.export` if CSV download should also be allowed.
6. Have the Coordinator reload the application and open `Admin · Analytics`. Their role remains `COORDINATOR`.
7. Other ADMIN maintenance modules remain blocked unless separately granted. `users.manage` always remains ADMIN-only.

## Example: Walk-in event request

1. Log in as Administrator or Coordinator with `bookings.create.walkin` permission. Administrator has it by default; Coordinators must be granted it.
2. Navigate to `/admin/walk-in` or `/coordinator/walk-in`.
3. Enter contact name, phone, optional email, event type/date/venue/guests/budget/package.
4. Enter preferences and optionally upload a Cloudinary inspiration image (JPG/PNG/WebP, <=1 MB).
5. Explain the Privacy Policy to the customer, record their acknowledgement in the form, and submit.
6. The request is saved with `bookings.source='WALK_IN'`, `client_id=NULL`, `created_by=<staff ID>`, status `TENTATIVE`, recorded privacy consent, and an initial booking-history row. **No fake user, password, or login session is created.**
7. Staff can review date conflicts, make status changes (requires `bookings.status`), and manage the booking exactly like other requests. Walk-in customer communication must occur via the recorded phone/email; staff notes in Messaging are NOT delivered to a non-registered user.
8. A later registration does not automatically associate the old walk-in booking with that account; doing that securely would require a separate identity-verification and claim workflow.

## Permission dependencies and boundaries

- Coordinator Event Requests listing requires `bookings.view.all`. Review page requires `bookings.review`; changing status requires `bookings.status`.
- Staff messaging requires `messages.staff` and `bookings.view.all` for the conversation listing. Client messaging requires personal-message and booking permissions.
- The Administrator Overview can be delegated separately from Analytics. Without `analytics.view` it shows the organization overview without financial analytics history.
- `analytics.view` does not grant `analytics.export`.
- Content, package and image uploads require their relevant management permission. Inspiration uploads require online booking or walk-in creation access.
- Backup policies (`settings.manage`) and performing a backup (`backups.manage`) are separately grantable. The existing off-site backup service still requires configured storage, encryption key and pg_dump. Browser restore is intentionally not enabled.
- All grants are stored server-side, evaluated against the active account each request, and logged. Do not rely on hidden buttons as a security boundary.
- Staff cannot change a client's own booking preferences or request cancellation as if they were that client. They may change status only with the separate status module and conflict checks.
- **Security/Privacy:** only authorized staff can view walk-in customer details. Registration remains a separate authenticated process, and walk-in consent is an assertion recorded by staff, not an electronic signature.

## SQL verification

```sql
SELECT id, reference, source, client_id, created_by, status
FROM public.bookings
ORDER BY created_at DESC LIMIT 15;

SELECT u.email, p.permission, p.allowed, p.updated_at
FROM public.user_module_permissions AS p
JOIN public.users AS u ON u.id=p.user_id
ORDER BY u.email, p.permission;
```

## Regression checklist

- Administrator still creates/deactivates accounts; existing administrator safety checks remain.
- Coordinator without extra grants still has Dashboard, Calendar, Event Requests, Messages and status updates.
- Client still registers, logs in, submits an online request with a normal `client_id`, uploads an image, reads their own bookings, sends messages, updates preferences and requests cancellation.
- Coordinator **without** `bookings.create.walkin` receives 403 on `POST /api/bookings/walk-in`; granting it enables the form and API.
- Coordinator granted `packages.manage` can edit packages but receives 403 from user-role/permission management.
- Coordinator granted analytics view but not export can open the report; GET `/api/report.csv` returns 403.
- A Coordinator denied `bookings.status` can review (if allowed) but cannot update booking status.
- Deactivating an account invalidates sessions; changing its role clears individual module overrides.
- Walk-in bookings appear in Administrator/Coordinator lists, calendar, summaries, status history, and have no online client login.
- Confirmed bookings still require an agreed value and enforce same-date conflict checks.
- Unpublished packages and private Cloudinary images remain permission-protected.
- Client account A cannot edit, cancel, or see client B's booking without an explicit sensitive global-data grant.

## Verification performed for this patch

- TypeScript/TSX **syntax parsing** across project source files passed.
- `node scripts/verify-source.mjs` passed for the project structure.
- `node scripts/verify-module-access.mjs` passed basic catalog/default/security and migration assertions.
- A **full typecheck, Next.js production build, and real Supabase migration have not been completed** in this environment; npm registry downloads were unavailable. Run these commands locally before production deployment.

## Privacy and secrets

The supplied project archive contained a `.env` file. Neither the patch ZIP nor the sanitized optional project ZIP includes this file or your live credentials. Keep secrets out of source control. Rotate any previously shared secrets.
