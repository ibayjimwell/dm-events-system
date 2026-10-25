-- Extend the existing schema, preserving all online bookings and their references.
ALTER TABLE "bookings" ALTER COLUMN "client_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_client_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "source" varchar(16) NOT NULL DEFAULT 'ONLINE';
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "created_by" uuid;
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_source_check" CHECK ("source" IN ('ONLINE','WALK_IN'));
--> statement-breakpoint
CREATE TABLE "user_module_permissions" (
  "user_id" uuid NOT NULL,
  "permission" varchar(80) NOT NULL,
  "allowed" boolean NOT NULL,
  "granted_by" uuid,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_module_permissions_pk" PRIMARY KEY ("user_id", "permission")
);
--> statement-breakpoint
ALTER TABLE "user_module_permissions" ADD CONSTRAINT "user_module_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "user_module_permissions" ADD CONSTRAINT "user_module_permissions_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE INDEX "user_module_permission_user_idx" ON "user_module_permissions" ("user_id");
--> statement-breakpoint
ALTER TABLE "user_module_permissions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "user_module_permissions" FROM anon, authenticated;
--> statement-breakpoint
-- Only privileged Next.js server database access may manage grants.
