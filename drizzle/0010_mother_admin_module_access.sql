-- Existing accounts preserve their former access as explicit individual grants.
-- Newly created accounts (including ADMIN and CLIENT) receive NO permissions.
-- The Mother Admin is deliberately NOT guessed by this migration: after migrate,
-- run `npm run seed` with SEED_ADMIN_EMAIL pointing to the intended owner.
ALTER TABLE "users" ADD COLUMN "is_root_admin" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE UNIQUE INDEX "users_one_root_admin_idx" ON "users" ("is_root_admin") WHERE "is_root_admin" = true;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_root_role_check" CHECK (NOT "is_root_admin" OR "role" = 'ADMIN');
--> statement-breakpoint
-- Keep users' access operational during the upgrade, even if some had
-- coordinator-specific DENY overrides. Never overwrite an existing override.
-- The special users.manage capability remains reserved for the Mother Admin.
INSERT INTO "user_module_permissions" ("user_id", "permission", "allowed", "granted_by")
SELECT u."id", a."permission", true, NULL
FROM "users" u
CROSS JOIN LATERAL unnest(
  CASE u."role"
    WHEN 'ADMIN' THEN ARRAY[
      'dashboard.client','dashboard.coordinator','dashboard.admin',
      'bookings.view.own','bookings.create.own','bookings.edit.own',
      'bookings.cancel.own','bookings.view.all','bookings.review',
      'bookings.status','bookings.create.walkin','calendar.view',
      'messages.own','messages.staff','analytics.view','analytics.export',
      'packages.manage','content.manage','backups.manage','settings.manage',
      'profile.edit'
    ]::varchar[]
    WHEN 'COORDINATOR' THEN ARRAY[
      'dashboard.coordinator','bookings.view.all','bookings.review',
      'bookings.status','calendar.view','messages.staff','profile.edit'
    ]::varchar[]
    ELSE ARRAY[
      'dashboard.client','bookings.view.own','bookings.create.own',
      'bookings.edit.own','bookings.cancel.own','messages.own','profile.edit'
    ]::varchar[]
  END
) AS a("permission")
ON CONFLICT ("user_id", "permission") DO NOTHING;
--> statement-breakpoint
-- Previously ADMIN could use self-service client functions; those require a
-- CLIENT identity, so remove non-client grants not eligible for their role.
DELETE FROM "user_module_permissions" p USING "users" u
WHERE p."user_id" = u."id" AND (
  (u."role" = 'CLIENT' AND p."permission" NOT IN (
    'dashboard.client','bookings.view.own','bookings.create.own',
    'bookings.edit.own','bookings.cancel.own','messages.own','profile.edit'
  ))
  OR (u."role" <> 'CLIENT' AND p."permission" IN (
    'dashboard.client','bookings.view.own','bookings.create.own',
    'bookings.edit.own','bookings.cancel.own','messages.own'
  ))
  OR p."permission" = 'users.manage'
);
