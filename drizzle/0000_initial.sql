CREATE TYPE "user_role" AS ENUM ('CLIENT','COORDINATOR','ADMIN');
--> statement-breakpoint
CREATE TYPE "booking_status" AS ENUM ('TENTATIVE','HELD','CONFIRMED','CANCELLED');
--> statement-breakpoint
CREATE TYPE "media_kind" AS ENUM ('INSPIRATION','MESSAGE','PACKAGE','HERO');
--> statement-breakpoint
CREATE TABLE "users" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),"email" varchar(320) NOT NULL,"password_hash" text NOT NULL,"full_name" varchar(180) NOT NULL,"phone" varchar(50),"role" "user_role" NOT NULL DEFAULT 'CLIENT',"is_active" boolean NOT NULL DEFAULT true,"email_verified_at" timestamptz,"created_at" timestamptz NOT NULL DEFAULT now(),"updated_at" timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" ("email");
--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" ("role");
--> statement-breakpoint
CREATE TABLE "sessions" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),"user_id" uuid NOT NULL CONSTRAINT "sessions_user_id_users_id_fk" REFERENCES "users"("id") ON DELETE CASCADE,"token_hash" varchar(64) NOT NULL UNIQUE,"expires_at" timestamptz NOT NULL,"created_at" timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" ("user_id");
--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" ("expires_at");
--> statement-breakpoint
CREATE TABLE "auth_tokens" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),"user_id" uuid NOT NULL CONSTRAINT "auth_tokens_user_id_users_id_fk" REFERENCES "users"("id") ON DELETE CASCADE,"purpose" varchar(24) NOT NULL,"token_hash" varchar(64) NOT NULL UNIQUE,"expires_at" timestamptz NOT NULL,"used_at" timestamptz,"created_at" timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE TABLE "auth_limits" ("key" varchar(128) PRIMARY KEY,"attempts" integer NOT NULL DEFAULT 0,"reset_at" timestamptz NOT NULL);
--> statement-breakpoint
CREATE TABLE "packages" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),"name" varchar(160) NOT NULL,"description" text NOT NULL,"inclusions" text[] NOT NULL DEFAULT '{}',"image_id" uuid,"published" boolean NOT NULL DEFAULT false,"sort_order" integer NOT NULL DEFAULT 0,"created_at" timestamptz NOT NULL DEFAULT now(),"updated_at" timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE INDEX "packages_published_idx" ON "packages" ("published");
--> statement-breakpoint
CREATE TABLE "media_assets" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),"uploaded_by" uuid NOT NULL CONSTRAINT "media_assets_uploaded_by_users_id_fk" REFERENCES "users"("id"),"booking_id" uuid,"kind" "media_kind" NOT NULL,"public_id" text NOT NULL,"delivery_type" varchar(20) NOT NULL DEFAULT 'authenticated',"original_name" varchar(255) NOT NULL,"stored_name" varchar(255) NOT NULL,"mime_type" varchar(50) NOT NULL,"byte_size" integer NOT NULL,"created_at" timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE INDEX "assets_owner_idx" ON "media_assets" ("uploaded_by");
--> statement-breakpoint
CREATE INDEX "assets_booking_idx" ON "media_assets" ("booking_id");
--> statement-breakpoint
CREATE TABLE "bookings" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),"reference" varchar(32) NOT NULL UNIQUE,"client_id" uuid NOT NULL CONSTRAINT "bookings_client_id_users_id_fk" REFERENCES "users"("id"),"package_id" uuid CONSTRAINT "bookings_package_id_packages_id_fk" REFERENCES "packages"("id") ON DELETE SET NULL,"contact_name" varchar(180) NOT NULL,"contact_email" varchar(320) NOT NULL,"contact_phone" varchar(50) NOT NULL,"event_type" varchar(120) NOT NULL,"event_date" date NOT NULL,"guest_count" integer NOT NULL,"venue" text NOT NULL,"estimated_budget" text NOT NULL,"preferred_theme" text NOT NULL DEFAULT '',"color_palette" text NOT NULL DEFAULT '',"special_requests" text NOT NULL DEFAULT '',"inspiration_asset_id" uuid CONSTRAINT "bookings_inspiration_asset_id_media_assets_id_fk" REFERENCES "media_assets"("id") ON DELETE SET NULL,"status" "booking_status" NOT NULL DEFAULT 'TENTATIVE',"booked_value" numeric(14,2),"confirmed_at" timestamptz,"review_note" text,"cancellation_requested_at" timestamptz,"cancellation_reason" text,"privacy_consented_at" timestamptz NOT NULL,"created_at" timestamptz NOT NULL DEFAULT now(),"updated_at" timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE INDEX "bookings_client_idx" ON "bookings" ("client_id");
--> statement-breakpoint
CREATE INDEX "bookings_date_idx" ON "bookings" ("event_date");
--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" ("status");
--> statement-breakpoint
CREATE INDEX "bookings_confirmed_idx" ON "bookings" ("confirmed_at");
--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_image_id_media_assets_id_fk" FOREIGN KEY ("image_id") REFERENCES "media_assets"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE TABLE "booking_history" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),"booking_id" uuid NOT NULL CONSTRAINT "booking_history_booking_id_bookings_id_fk" REFERENCES "bookings"("id") ON DELETE CASCADE,"actor_id" uuid NOT NULL CONSTRAINT "booking_history_actor_id_users_id_fk" REFERENCES "users"("id"),"from_status" "booking_status","to_status" "booking_status" NOT NULL,"note" text,"override_conflict" boolean NOT NULL DEFAULT false,"created_at" timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE INDEX "history_booking_idx" ON "booking_history" ("booking_id");
--> statement-breakpoint
CREATE TABLE "messages" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),"booking_id" uuid NOT NULL CONSTRAINT "messages_booking_id_bookings_id_fk" REFERENCES "bookings"("id") ON DELETE CASCADE,"sender_id" uuid NOT NULL CONSTRAINT "messages_sender_id_users_id_fk" REFERENCES "users"("id"),"body" text NOT NULL DEFAULT '',"asset_id" uuid CONSTRAINT "messages_asset_id_media_assets_id_fk" REFERENCES "media_assets"("id") ON DELETE SET NULL,"created_at" timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE INDEX "messages_booking_date_idx" ON "messages" ("booking_id","created_at");
--> statement-breakpoint
CREATE TABLE "message_reads" ("booking_id" uuid NOT NULL CONSTRAINT "message_reads_booking_id_bookings_id_fk" REFERENCES "bookings"("id") ON DELETE CASCADE,"user_id" uuid NOT NULL CONSTRAINT "message_reads_user_id_users_id_fk" REFERENCES "users"("id") ON DELETE CASCADE,"last_read_at" timestamptz NOT NULL DEFAULT now(),CONSTRAINT "message_reads_pk" PRIMARY KEY ("booking_id","user_id"));
--> statement-breakpoint
CREATE TABLE "site_content" ("id" varchar(24) PRIMARY KEY DEFAULT 'main',"hero_title" text NOT NULL DEFAULT 'Your Vision. Our Celebration.',"hero_subtitle" text NOT NULL DEFAULT 'Plan memorable events with DM Events — from your first idea to the confirmed date.',"hero_image_id" uuid CONSTRAINT "site_content_hero_image_id_media_assets_id_fk" REFERENCES "media_assets"("id") ON DELETE SET NULL,"contact_email" text NOT NULL DEFAULT '',"contact_phone" text NOT NULL DEFAULT '',"privacy_policy" text NOT NULL DEFAULT '',"draft" jsonb,"created_at" timestamptz NOT NULL DEFAULT now(),"updated_at" timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE TABLE "system_settings" ("id" varchar(24) PRIMARY KEY DEFAULT 'main',"backups_enabled" boolean NOT NULL DEFAULT false,"retention_days" integer NOT NULL DEFAULT 30,"backup_frequency_hours" integer NOT NULL DEFAULT 24,"created_at" timestamptz NOT NULL DEFAULT now(),"updated_at" timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE TABLE "backup_logs" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),"performed_by" uuid CONSTRAINT "backup_logs_performed_by_users_id_fk" REFERENCES "users"("id"),"status" varchar(24) NOT NULL,"storage_key" text,"size_bytes" integer,"error" text,"created_at" timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE TABLE "audit_logs" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),"actor_id" uuid CONSTRAINT "audit_logs_actor_id_users_id_fk" REFERENCES "users"("id") ON DELETE SET NULL,"action" varchar(120) NOT NULL,"target_type" varchar(48) NOT NULL,"target_id" text NOT NULL,"details" jsonb,"created_at" timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" ("created_at");
--> statement-breakpoint
INSERT INTO "site_content" ("id","privacy_policy") VALUES ('main','DM Events collects contact information, event requirements, preferences, conversations and voluntarily submitted inspiration images to coordinate booking inquiries. Only authorized personnel may access booking data for the purpose of managing events. Contact DM Events to request corrections or deletion subject to applicable legal retention. This is a provisional policy and must be reviewed and approved before collecting real customer information.');
--> statement-breakpoint
INSERT INTO "system_settings" ("id") VALUES ('main');
