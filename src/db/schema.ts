import {
  pgTable,
  pgEnum,
  type AnyPgColumn,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
  date,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const roles = pgEnum("user_role", ["CLIENT", "COORDINATOR", "ADMIN"]);
export const statuses = pgEnum("booking_status", [
  "TENTATIVE",
  "HELD",
  "CONFIRMED",
  "CANCELLED",
]);
export const mediaKinds = pgEnum("media_kind", [
  "INSPIRATION",
  "MESSAGE",
  "PACKAGE",
  "HERO",
]);
const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: varchar("full_name", { length: 180 }).notNull(),
    phone: varchar("phone", { length: 50 }),
    role: roles("role").notNull().default("CLIENT"),
    isActive: boolean("is_active").notNull().default(true),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    signupVerificationRequired: boolean("signup_verification_required").notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    index("users_role_idx").on(t.role),
  ],
);
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("sessions_user_idx").on(t.userId),
    index("sessions_expires_idx").on(t.expiresAt),
  ],
);
export const authTokens = pgTable("auth_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  purpose: varchar("purpose", { length: 24 }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const authLimits = pgTable("auth_limits", {
  key: varchar("key", { length: 128 }).primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});
export const packages = pgTable(
  "packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description").notNull(),
    inclusions: text("inclusions").array().notNull().default([]),
    imageId: uuid("image_id").references((): AnyPgColumn => mediaAssets.id, {
      onDelete: "set null",
    }),
    published: boolean("published").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps(),
  },
  (t) => [index("packages_published_idx").on(t.published)],
);
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    bookingId: uuid("booking_id").references((): AnyPgColumn => bookings.id, {
      onDelete: "set null",
    }),
    kind: mediaKinds("kind").notNull(),
    publicId: text("public_id").notNull(),
    deliveryType: varchar("delivery_type", { length: 20 })
      .notNull()
      .default("authenticated"),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    storedName: varchar("stored_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 50 }).notNull(),
    byteSize: integer("byte_size").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("assets_owner_idx").on(t.uploadedBy),
    index("assets_booking_idx").on(t.bookingId),
  ],
);
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: varchar("reference", { length: 32 }).notNull().unique(),
    clientId: uuid("client_id").references(() => users.id, {
      onDelete: "set null",
    }),
    source: varchar("source", { length: 16 }).notNull().default("ONLINE"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    packageId: uuid("package_id").references((): AnyPgColumn => packages.id, {
      onDelete: "set null",
    }),
    contactName: varchar("contact_name", { length: 180 }).notNull(),
    contactEmail: varchar("contact_email", { length: 320 }).notNull(),
    contactPhone: varchar("contact_phone", { length: 50 }).notNull(),
    eventType: varchar("event_type", { length: 120 }).notNull(),
    eventDate: date("event_date").notNull(),
    guestCount: integer("guest_count").notNull(),
    venue: text("venue").notNull(),
    estimatedBudget: text("estimated_budget").notNull(),
    preferredTheme: text("preferred_theme").notNull().default(""),
    colorPalette: text("color_palette").notNull().default(""),
    specialRequests: text("special_requests").notNull().default(""),
    inspirationAssetId: uuid("inspiration_asset_id").references(
      (): AnyPgColumn => mediaAssets.id,
      { onDelete: "set null" },
    ),
    status: statuses("status").notNull().default("TENTATIVE"),
    bookedValue: numeric("booked_value", { precision: 14, scale: 2 }),
    // Staff maintain operational timing separately from a client's preferred event date.
    eventStartTime: varchar("event_start_time", { length: 5 }),
    eventEndTime: varchar("event_end_time", { length: 5 }),
    assignedCoordinatorId: uuid("assigned_coordinator_id").references(() => users.id, { onDelete: "set null" }),
    scheduleNotes: text("schedule_notes").notNull().default(""),
    scheduleUpdatedAt: timestamp("schedule_updated_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    cancellationRequestedAt: timestamp("cancellation_requested_at", {
      withTimezone: true,
    }),
    cancellationReason: text("cancellation_reason"),
    privacyConsentedAt: timestamp("privacy_consented_at", {
      withTimezone: true,
    }).notNull(),
    ...timestamps(),
  },
  (t) => [
    index("bookings_client_idx").on(t.clientId),
    index("bookings_assigned_coordinator_idx").on(t.assignedCoordinatorId, t.eventDate),
    check("booking_times_pair_check", sql`(${t.eventStartTime} IS NULL AND ${t.eventEndTime} IS NULL) OR (${t.eventStartTime} IS NOT NULL AND ${t.eventEndTime} IS NOT NULL AND ${t.eventStartTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND ${t.eventEndTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND ${t.eventStartTime} < ${t.eventEndTime})`),
    index("bookings_date_idx").on(t.eventDate),
    uniqueIndex("bookings_one_reserved_date").on(t.eventDate).where(sql`${t.status} IN ('HELD','CONFIRMED')`),
    index("bookings_status_idx").on(t.status),
    index("bookings_confirmed_idx").on(t.confirmedAt),
    check("bookings_source_check", sql`${t.source} IN ('ONLINE','WALK_IN')`),
  ],
);
/** Immutable financial changes; monthly confirmation reporting must not rewrite history. */
export const bookingValueEvents = pgTable(
  "booking_value_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "restrict" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    eventType: varchar("event_type", { length: 20 }).notNull(),
    amountDelta: numeric("amount_delta", { precision: 14, scale: 2 }).notNull(),
    valueAfter: numeric("value_after", { precision: 14, scale: 2 }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    note: text("note"),
  },
  (t) => [
    index("booking_value_events_month_idx").on(t.recordedAt),
    index("booking_value_events_booking_idx").on(t.bookingId),
    check("booking_value_events_type_check", sql`${t.eventType} IN ('CONFIRMATION','ADJUSTMENT','REVERSAL')`),
    check("booking_value_events_value_after_check", sql`${t.valueAfter} >= 0`),
    check("booking_value_events_nonzero_check", sql`${t.amountDelta} <> 0`),
  ],
);

export const bookingHistory = pgTable(
  "booking_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references((): AnyPgColumn => bookings.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    fromStatus: statuses("from_status"),
    toStatus: statuses("to_status").notNull(),
    note: text("note"),
    overrideConflict: boolean("override_conflict").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("history_booking_idx").on(t.bookingId)],
);
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references((): AnyPgColumn => bookings.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull().default(""),
    assetId: uuid("asset_id").references((): AnyPgColumn => mediaAssets.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("messages_booking_date_idx").on(t.bookingId, t.createdAt)],
);
export const messageReads = pgTable(
  "message_reads",
  {
    bookingId: uuid("booking_id")
      .notNull()
      .references((): AnyPgColumn => bookings.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.bookingId, t.userId] })],
);
/** Ephemeral typing presence, persisted briefly so the server can bridge Supabase Realtime
 * to custom-session browser clients without exposing a Supabase privileged key. */
export const messageTyping = pgTable(
  "message_typing",
  {
    bookingId: uuid("booking_id").notNull().references((): AnyPgColumn => bookings.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    isTyping: boolean("is_typing").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.bookingId, t.userId] }),
    index("message_typing_expires_idx").on(t.expiresAt),
  ],
);

export const siteContent = pgTable("site_content", {
  id: varchar("id", { length: 24 }).primaryKey().default("main"),
  heroTitle: text("hero_title")
    .notNull()
    .default("Your Vision. Our Celebration."),
  heroSubtitle: text("hero_subtitle")
    .notNull()
    .default(
      "Plan memorable events with DM Events — from your first idea to the confirmed date.",
    ),
  heroImageId: uuid("hero_image_id").references(
    (): AnyPgColumn => mediaAssets.id,
    { onDelete: "set null" },
  ),
  contactEmail: text("contact_email").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  privacyPolicy: text("privacy_policy").notNull().default(""),
  homepage: jsonb("homepage").notNull().default(sql`'{}'::jsonb`),
  draft: jsonb("draft"),
  ...timestamps(),
});
export const systemSettings = pgTable("system_settings", {
  id: varchar("id", { length: 24 }).primaryKey().default("main"),
  backupsEnabled: boolean("backups_enabled").notNull().default(false),
  retentionDays: integer("retention_days").notNull().default(30),
  backupFrequencyHours: integer("backup_frequency_hours").notNull().default(24),
  ...timestamps(),
});
export const backupLogs = pgTable("backup_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  performedBy: uuid("performed_by").references(() => users.id),
  status: varchar("status", { length: 24 }).notNull(),
  storageKey: text("storage_key"),
  sizeBytes: integer("size_bytes"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 120 }).notNull(),
    targetType: varchar("target_type", { length: 48 }).notNull(),
    targetId: text("target_id").notNull(),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)],
);
export const userModulePermissions = pgTable(
  "user_module_permissions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permission: varchar("permission", { length: 80 }).notNull(),
    allowed: boolean("allowed").notNull(),
    grantedBy: uuid("granted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.permission] }),
    index("user_module_permission_user_idx").on(t.userId),
  ],
);
export const userRelations = relations(users, ({ many }) => ({
  bookings: many(bookings),
  permissions: many(userModulePermissions),
  messages: many(messages),
  sessions: many(sessions),
}));
export const bookingRelations = relations(bookings, ({ one, many }) => ({
  client: one(users, { fields: [bookings.clientId], references: [users.id] }),
  package: one(packages, {
    fields: [bookings.packageId],
    references: [packages.id],
  }),
  history: many(bookingHistory),
  messages: many(messages),
}));
export const messageRelations = relations(messages, ({ one }) => ({
  booking: one(bookings, {
    fields: [messages.bookingId],
    references: [bookings.id],
  }),
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
}));

/** Transactional outbox: the booking transaction and notification intent commit together. */
export const notificationOutbox = pgTable(
  "notification_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references((): AnyPgColumn => bookings.id, { onDelete: "cascade" }),
    eventKey: varchar("event_key", { length: 180 }).notNull().unique(),
    eventType: varchar("event_type", { length: 48 }).notNull(),
    channel: varchar("channel", { length: 12 }).notNull(),
    recipient: varchar("recipient", { length: 320 }).notNull(),
    payload: jsonb("payload")
      .$type<import("@/lib/notifications/types").NotificationPayload>()
      .notNull(),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    providerId: varchar("provider_id", { length: 128 }),
    lastError: text("last_error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index("notify_pending_idx").on(t.status, t.nextAttemptAt),
    index("notify_booking_idx").on(t.bookingId),
    check("notify_channel_check", sql`${t.channel} IN ('EMAIL','SMS')`),
    check(
      "notify_status_check",
      sql`${t.status} IN ('PENDING','PROCESSING','RETRY','ACCEPTED','FAILED')`,
    ),
  ],
);
