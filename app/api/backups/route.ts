import { requirePermission } from '@/lib/access';
import { route, ok } from '@/lib/http';
import { audit } from '@/lib/auth';
import { createManualBackup } from '@/lib/manualBackup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Lightweight status: the server does not store backup files or invent a success history. */
export const GET = route(async () => {
  await requirePermission('backups.manage');
  return ok({
    mode: 'manual-download',
    implementation: 'simple-backup-vercel-v2',
    configured: Boolean(process.env.DATABASE_URL),
    message: 'Download a database snapshot directly to your device. No payment method or external backup provider is required.',
    includes: 'All PostgreSQL public tables (data only)',
    excludes: 'External media files, Supabase-managed auth/storage and database schema definitions',
  });
});

/** A same-origin, authenticated POST returns a private file attachment; nothing is uploaded elsewhere. */
export const POST = route(async () => {
  const user = await requirePermission('backups.manage');
  const result = await createManualBackup();
  try {
    await audit(user.id, 'DATABASE_BACKUP_DOWNLOADED', 'backup', 'manual', result.summary);
  } catch (error) {
    // The export is already complete. Do not discard the only recovery copy because audit logging failed.
    console.error('Manual backup audit logging failed:', error);
  }
  const bytes = new Uint8Array(result.archive);
  return new Response(bytes.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'X-DM-Backup-Tables': String(result.summary.tables),
      'X-DM-Backup-Rows': String(result.summary.rows),
    },
  });
});
