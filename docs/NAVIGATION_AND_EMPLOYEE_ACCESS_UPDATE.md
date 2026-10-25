# DM Events: compact header and employee-only permission editor

## Purpose

The existing module RBAC and walk-in booking functionality remain intact. This UI update keeps permission-backed routes and endpoints, but reduces the number of links in the global header. It also makes Client permissions fixed by role on the server, not merely hidden from the UI.

## Navigation

**Administrator primary navigation:** Overview, Analytics, Bookings, Settings, Log out. Secondary Booking Tools (Walk-in), Website & Administration (Packages, Content, Backups, System Settings, User Access), and Operations (Dashboard, Calendar, Requests, Messages) appear in the Settings dropdown **only when allowed**.

**Coordinator primary navigation:** Dashboard, Calendar, Event Requests, Messages, Settings, Log out. Walk-in and explicitly delegated Administrator modules appear in Settings **only when granted**. Users cannot acquire `users.manage` through a grant.

**Client primary navigation:** Dashboard, My Bookings, Messages, Profile. Client accounts do not have a permission editor or staff tools.

**Public primary navigation:** Home, Packages, Book an Event, Messages, Log in. An already signed-in user follows a Dashboard link to the appropriate portal.

At widths below `lg`, navigation collapses into a full-width menu with an expandable Settings & Tools section. The menu has a bounded viewport height to prevent page-level overflow. All new layout styles use Tailwind CSS classes.

## User Access (`/admin/maintenance/users`)

On desktop (XL): `Accounts & Roles | Module Permissions | Create Account` as three columns. Below XL: same order, stacked. Accounts & Roles still lists all accounts, supports employee/client filtering, role changes, active toggling, and Staff module selection. The center column only permits selecting Coordinators and Administrators; Clients never appear in that selector or its module list. Administrators inherit full permissions, so their module view is read-only. Coordinators can have individual ALLOW/DENY/INHERIT overrides except Administrator-only permissions.

Client account creation and role/active management remain available; only CLIENT **module overrides** are prohibited. Staff creation, permission grants, and role changes still require the existing `users.manage` permission (Administrator-only).

## Security changes

- `src/lib/access.ts`: `permissionSet()` and `can()` ignore client override rows and return strictly Client role defaults for Client accounts. Any legacy client override records are harmless without deleting data.
- `app/api/permissions/route.ts`: both GET and PATCH reject Client user IDs. Admin access is role-inherited, not editable.
- UI link visibility complements, but does not replace, page/API permission checks. No migrations or changes to the permission table are required.

## Apply

Merge or overwrite **only the full files included in this patch**. If you have manually edited these paths since the prior RBAC update, compare them before replacing. No `.env`, database reset, migration, seed or extra npm dependency is required.

```sh
npm run typecheck
npm run build
npm run dev
```

## Manual regression checklist

1. Administrator: only primary header links are visible; Settings has allowed website modules and operations. Open User Access and verify the columns are ordered Accounts → Module Permissions → Create Account.
2. Coordinator: only operational primary links appear. Grant `analytics.view` from Admin → User Access; after refresh, `Monthly Analytics` appears inside Settings. Direct URL/API for ungranted packages, backups, users remains denied.
3. Client: navigation contains only the four client sections. Client account remains visible in Accounts & Roles (for role/activity management) but never in the module selector. Direct API GET/PATCH `/api/permissions` targeting a client returns 403, even if the caller is an Admin.
4. Coordinator: grant `bookings.create.walkin`; Walk-in Booking appears under Settings and remains functional. Revoke it and verify both navigation and server reject it.
5. Administrator account: module list is read-only; account management remains Administrator-only.
6. On 360px, 390px, 768px and 1280px widths: no header overflow; Settings opens/closes; all 3 access panels remain readable without viewport-level sideways scrolling.
7. Changing a staff member's role resets overrides as before. Client registration and all existing client booking flows continue to function.
