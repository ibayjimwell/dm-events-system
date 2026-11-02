# Mother Admin-controlled User Access — DM Events

## New behavior

- The **Mother Admin** is the one protected, designated owner. Only this account may use `users.manage` and the User Access editor/API. No account may grant `users.manage` to another user.
- Every **new** ADMIN, COORDINATOR, and CLIENT account starts with **no** module grants. The chosen role never grants access automatically.
- The Mother Admin assigns or revokes modules individually. Administrators can now have limited permissions instead of automatic access to the entire system.
- Client accounts can only receive client self-service permissions, including their own booking and messaging modules. Staff accounts cannot be given client-identity permissions; staff use their assigned walk-in and operational modules.
- Changing a user's role clears their grants and sessions. Deactivating an account clears sessions. The Mother Admin's role, status and grants cannot be changed using the web application.
- An account without an accessible portal page is redirected to `/access-pending` instead of looping between dashboards.
- Permission changes are enforced on the server in pages and APIs; hiding or displaying a navigation item is not used as an authorization check.

## Installation and required bootstrap (important)

**Back up the Supabase PostgreSQL database before migrating.**

1. Apply the changed-files ZIP to the root of the DM Events Next.js project; preserve paths.
2. Ensure `SEED_ADMIN_EMAIL` in your local/private environment identifies your **existing intended owner** (not a newly created limited administrator). Never place the email/password in committed code.
3. Run these commands, in order:

   ```bash
   npm ci
   npm run db:migrate
   npm run access:bootstrap
   npm run typecheck
   npm run build
   ```

4. Restart/redeploy the web server. On Vercel, install the migration and run `access:bootstrap` against the production database **before serving the updated application**. No SQL editor manual grant is needed.
5. Sign in using the Mother Admin account, open **User Access**, select an account (Admin, Coordinator, or Client), and grant the appropriate modules. The new account can sign in and use only the pages/actions you assigned.

**Bootstrap is mandatory:** migration `0010_mother_admin_module_access.sql` *does not guess* the owner among your existing administrator accounts. `npm run access:bootstrap` promotes only the matching existing active ADMIN (`SEED_ADMIN_EMAIL`) and refuses to overwrite a different owner. The database permits only one Mother Admin. If the account does not exist, use the existing `npm run seed` process to create it first; `npm run seed` also promotes the configured seed admin after migration.

### Existing users and safe rollout

The migration preserves permissions of **existing** admins, coordinators and clients as explicit grants (rather than removing access unexpectedly). Existing coordinators' custom overrides are preserved. The original automatic role inheritance is removed. The Mother Admin can subsequently revoke unwanted grants through User Access.

**New** users, including self-registered clients, receive *no grants*. If you want clients to use booking immediately after registration, the Mother Admin must assign their client modules. The app displays a pending-access screen until a permitted page is available. This requirement is an intentional behavioral change; do not deploy it assuming registration automatically permits client booking.

### Recommended minimum grants

| User | Suggested grants (Mother Admin selects) |
|---|---|
| Client | Client dashboard, My bookings, Submit own booking, Client messages, Own profile |
| Coordinator | Coordinator dashboard, All event requests, Review requests, Change booking status, Event calendar, Staff messages |
| Limited Administrator | Administrator overview, then only the specific modules needed: bookings, packages, analytics, website content, settings, etc. |
| Mother Admin | Full access is permanent and cannot be delegated through the UI |

A person with only an action permission and no accessible page will see the waiting-for-access screen until the Mother Admin also assigns the related navigation/page permission.

## Files included

- Database: `src/db/schema.ts`, `drizzle/0010_mother_admin_module_access.sql`, `drizzle/meta/_journal.json`.
- Authentication / grants: `src/lib/auth.ts`, `src/lib/access.ts`, `src/lib/permissions.ts`, `src/lib/portalHome.ts`, `app/api/users/route.ts`, `app/api/permissions/route.ts`, `app/api/auth/login/route.ts`.
- User interface: `src/components/admin/UsersEditor.tsx`, login/root landing, three portal layouts, `src/components/shared/SiteNav.tsx`, `src/components/shared/LogoutButton.tsx`, `app/(public)/access-pending/page.tsx`, and auth form.
- Bootstrap: `scripts/bootstrap-mother-admin.ts`, updated `scripts/seed.ts`, and `package.json`.
- Regression tests: `tests/mother-admin-access.test.cjs` and updated tests that previously asserted the now-removed automatic role grants.

## Verification in the artifact-creation environment

- 159/159 source tests passed using `node --test tests/*.test.cjs`.
- `node scripts/verify-module-access.mjs` passed.
- TypeScript transpilation/syntax checks passed for the 20 changed TypeScript/TSX files.
- **Full Next.js typecheck, production build, and live DB migration remain unverified.** `npm ci --offline` could not install the required npm dependencies; test migration on a staging/backup database before production.
