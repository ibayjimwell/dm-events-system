import type { BackupArchive, BackupTable } from '@/lib/manualBackupFormat';

/**
 * Read-only, privacy-aware exploration of an already decrypted AND verified backup.
 * Never return arbitrary row objects to the browser: some tables contain password
 * hashes, reset tokens, private conversations, API credentials or client PII.
 */
type Category = 'Operations' | 'Finance' | 'Clients & access' | 'Communication' | 'Content' | 'System';
type Profile = { label: string; category: Category; fields: readonly string[] };

const PROFILES: Readonly<Record<string, Profile>> = {
  bookings: { label: 'Event bookings', category: 'Operations', fields: ['reference', 'source', 'contact_name', 'event_type', 'event_date', 'status', 'guest_count', 'venue', 'estimated_budget', 'booked_value', 'event_start_time', 'event_end_time', 'created_at'] },
  booking_history: { label: 'Booking status history', category: 'Operations', fields: ['booking_id', 'from_status', 'to_status', 'created_at', 'override_conflict'] },
  packages: { label: 'Event packages', category: 'Operations', fields: ['name', 'published', 'sort_order', 'created_at', 'updated_at'] },
  booking_value_events: { label: 'Booking value movements', category: 'Finance', fields: ['booking_id', 'event_type', 'amount_delta', 'value_after', 'recorded_at'] },
  booking_service_feedback: { label: 'Client ratings', category: 'Operations', fields: ['booking_id', 'rating', 'public_consent_at', 'created_at'] },
  users: { label: 'User accounts', category: 'Clients & access', fields: ['id', 'full_name', 'role', 'is_active', 'is_root_admin', 'created_at'] },
  user_module_permissions: { label: 'Module access', category: 'Clients & access', fields: ['user_id', 'permission', 'allowed', 'updated_at'] },
  messages: { label: 'Message metadata', category: 'Communication', fields: ['id', 'booking_id', 'sender_id', 'created_at'] },
  message_reads: { label: 'Message read states', category: 'Communication', fields: ['booking_id', 'user_id', 'last_read_at'] },
  message_thread_preferences: { label: 'Archived conversations', category: 'Communication', fields: ['booking_id', 'user_id', 'archived_at'] },
  message_thread_deletions: { label: 'Chat deletion history', category: 'Communication', fields: ['booking_id', 'deleted_at', 'purge_after', 'purged_at'] },
  media_assets: { label: 'Media references', category: 'Content', fields: ['id', 'booking_id', 'kind', 'mime_type', 'byte_size', 'created_at'] },
  site_content: { label: 'Website content metadata', category: 'Content', fields: ['id', 'hero_title', 'updated_at'] },
  audit_logs: { label: 'Audit trail', category: 'System', fields: ['action', 'target_type', 'created_at'] },
  backup_logs: { label: 'Legacy backup logs', category: 'System', fields: ['status', 'size_bytes', 'created_at'] },
  backup_archives: { label: 'Legacy backup archive registry', category: 'System', fields: ['id', 'status', 'created_at'] },
  backup_schedules: { label: 'Legacy backup schedules', category: 'System', fields: ['frequency', 'enabled', 'created_at'] },
};

// Unknown and highly sensitive tables can be counted but must NEVER be previewed.
const RESTRICTED_LABELS: Readonly<Record<string, string>> = {
  auth_tokens: 'Authentication tokens', auth_limits: 'Authentication rate limits',
  sessions: 'Active login sessions', notification_outbox: 'Notification delivery queue',
  message_typing: 'Ephemeral message typing', system_settings: 'System settings',
};

export type BackupTableInfo = {
  name: string; label: string; category: Category; rows: number; columns: number;
  previewable: boolean; reason: string | null;
};
export type BackupOverview = {
  verified: true; filename: string; exportedAt: string; verifiedAt: string;
  tables: number; rows: number; tableNames: string[]; format: string;
  schema: string; sha256: string; tableDetails: BackupTableInfo[];
  message: string; warnings: string[];
  bookings: {
    total: number; byStatus: { status: string; count: number }[];
    bySource: { source: string; count: number }[];
    byEventType: { eventType: string; count: number }[];
    upcomingConfirmed: number;
  };
  finance: { currentConfirmedValue: number; positiveMovements: number; negativeMovements: number; netMovements: number };
  accounts: { total: number; byRole: { role: string; count: number }[] };
  communications: { messages: number; deletedThreads: number };
  packages: { total: number; published: number };
  feedback: { total: number; publicReviews: number; averageRating: number | null };
};
export type BackupPreview = {
  table: string; label: string; category: Category; previewable: boolean;
  reason: string | null; columns: string[]; rows: Record<string, string | number | boolean | null>[];
  totalRows: number; matchedRows: number; offset: number; limit: number;
};

function rowsIn(backup: BackupArchive, name: string): Record<string, unknown>[] {
  const table = backup.tables.find(t => t.name === name);
  return table ? table.rows.map(row => JSON.parse(row) as Record<string, unknown>) : [];
}
function countBy(rows: Record<string, unknown>[], key: string): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = String(row[key] ?? 'Unknown').slice(0, 90);
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts].map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
function amount(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number') return 0;
  const result = Number(value);
  return Number.isFinite(result) && Math.abs(result) < 1e15 ? result : 0;
}
function philippinesDate(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '9999-12-31';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(time));
  const part = (name: string) => parts.find(item => item.type === name)?.value || '00';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function backupTableDetails(backup: BackupArchive): BackupTableInfo[] {
  return backup.tables.map(t => {
    const profile = PROFILES[t.name];
    return {
      name: t.name,
      label: profile?.label || RESTRICTED_LABELS[t.name] || t.name.replaceAll('_', ' '),
      category: profile?.category || 'System', rows: t.rows.length, columns: t.columns.length,
      previewable: Boolean(profile && profile.fields.some(col => t.columns.includes(col))),
      reason: profile && profile.fields.some(col => t.columns.includes(col)) ? null : 'Preview restricted: no safe preview fields are available for this table.',
    };
  }).sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
}

/** SHA-256 checksum verification happened upstream inside unpackManualBackup. */
export function summarizeBackup(backup: BackupArchive, filename: string): BackupOverview {
  const bookings = rowsIn(backup, 'bookings');
  const movements = rowsIn(backup, 'booking_value_events');
  const accounts = rowsIn(backup, 'users');
  const packages = rowsIn(backup, 'packages');
  const feedback = rowsIn(backup, 'booking_service_feedback');
  const msg = rowsIn(backup, 'messages');
  const deletions = rowsIn(backup, 'message_thread_deletions');
  const eventDate = philippinesDate(backup.exportedAt);
  const bookedValues = bookings
    .filter(row => ['CONFIRMED', 'COMPLETED'].includes(String(row.status || '')))
    .reduce((sum, row) => sum + amount(row.booked_value), 0);
  const positiveMovements = movements.reduce((sum, row) => sum + Math.max(0, amount(row.amount_delta)), 0);
  const negativeMovements = movements.reduce((sum, row) => sum + Math.abs(Math.min(0, amount(row.amount_delta))), 0);
  const ratings = feedback.map(row => amount(row.rating)).filter(value => value >= 1 && value <= 5);
  const required = ['bookings', 'users', 'packages', 'messages'];
  const missing = required.filter(name => !backup.tables.some(table => table.name === name));
  const warnings = [
    ...(missing.length ? [`Core tables absent from snapshot: ${missing.join(', ')}. Check schema compatibility before recovery.`] : []),
    'Data-only public schema snapshot; SQL schema/migrations, Cloudinary files, Supabase Storage assets and environment variables are not included.',
    'Checksum verification is not proof of a successful restore. Test recovery against a separate empty database.',
    'Review previews hide password hashes, tokens, private message bodies, contact email/phone and other high-risk fields.',
  ];
  return {
    verified: true, filename, exportedAt: backup.exportedAt,
    verifiedAt: new Date().toISOString(), tables: backup.tableCount, rows: backup.rowCount,
    tableNames: backup.tables.map(t => t.name), tableDetails: backupTableDetails(backup),
    format: backup.format, schema: backup.schema, sha256: backup.sha256,
    message: 'Encrypted archive decrypted, structure checked and SHA-256 checksum verified. No restoration attempted.',
    warnings,
    bookings: {
      total: bookings.length,
      byStatus: countBy(bookings, 'status').map(v => ({ status: v.key, count: v.count })),
      bySource: countBy(bookings, 'source').map(v => ({ source: v.key, count: v.count })),
      byEventType: countBy(bookings, 'event_type').slice(0, 8).map(v => ({ eventType: v.key, count: v.count })),
      upcomingConfirmed: bookings.filter(row => row.status === 'CONFIRMED' && typeof row.event_date === 'string' && row.event_date >= eventDate).length,
    },
    finance: {
      currentConfirmedValue: bookedValues, positiveMovements, negativeMovements,
      netMovements: positiveMovements - negativeMovements,
    },
    accounts: { total: accounts.length, byRole: countBy(accounts, 'role').map(v => ({ role: v.key, count: v.count })) },
    communications: { messages: msg.length, deletedThreads: deletions.length },
    packages: { total: packages.length, published: packages.filter(row => row.published === true).length },
    feedback: { total: feedback.length, publicReviews: feedback.filter(row => Boolean(row.public_consent_at)).length,
      averageRating: ratings.length ? Math.round(100 * ratings.reduce((a, b) => a + b, 0) / ratings.length) / 100 : null },
  };
}

function displayValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.length > 250 ? `${value.slice(0, 247)}…` : value;
  // Avoid sending JSON/objects, which could contain nested secrets.
  return '[Structured value hidden]';
}

/** Search is limited to the same allowlisted values sent to the browser. */
export function previewBackupTable(backup: BackupArchive, name: string, offset: number, limit: number, query = ''): BackupPreview {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error('Invalid table name.');
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new Error('Invalid backup preview offset.');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error('Invalid backup preview page size.');
  if (typeof query !== 'string' || query.length > 100) throw new Error('Search is limited to 100 characters.');
  const table: BackupTable | undefined = backup.tables.find(t => t.name === name);
  if (!table) throw new Error('Table does not exist in this backup.');
  const profile = PROFILES[name];
  const columns = profile?.fields.filter(col => table.columns.includes(col)) || [];
  if (!profile || !columns.length) {
    return { table: name, label: RESTRICTED_LABELS[name] || name.replaceAll('_', ' '), category: 'System', previewable: false,
      reason: 'This table can be counted, but its contents are restricted for privacy and security.', columns: [], rows: [],
      totalRows: table.rows.length, matchedRows: 0, offset, limit };
  }
  const needle = query.trim().toLocaleLowerCase();
  const matched: Record<string, string | number | boolean | null>[] = [];
  let matchedRows = 0;
  for (const raw of table.rows) {
    const record = JSON.parse(raw) as Record<string, unknown>;
    const safe: Record<string, string | number | boolean | null> = {};
    for (const col of columns) safe[col] = displayValue(record[col]);
    if (!needle || columns.some(col => String(safe[col] ?? '').toLocaleLowerCase().includes(needle))) {
      if (matchedRows >= offset && matched.length < limit) matched.push(safe);
      matchedRows += 1;
    }
  }
  return { table: name, label: profile.label, category: profile.category, previewable: true, reason: null,
    columns, rows: matched, totalRows: table.rows.length, matchedRows, offset, limit };
}
