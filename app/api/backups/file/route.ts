import { requirePermission } from '@/lib/access';
import { route, ok, HttpError } from '@/lib/http';
import { audit } from '@/lib/auth';
import { deleteStoredBackup, readStoredBackup } from '@/lib/managedBackupStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function pathFrom(req: Request): string {
  const path = new URL(req.url).searchParams.get('path') || '';
  if (!path || path.length > 220) throw new HttpError(400, 'Backup path is missing or invalid.');
  return path;
}

/** Inspect integrity and contents, or download a verified archive. Never expose the encrypted object URL. */
export const GET = route(async req => {
  await requirePermission('backups.manage');
  const action = new URL(req.url).searchParams.get('action') || 'download';
  if (action !== 'inspect' && action !== 'download') throw new HttpError(400, 'Invalid backup action.');
  const { archive, payload, filename } = await readStoredBackup(pathFrom(req));
  if (action === 'inspect') {
    return ok({
      verified: true, filename, exportedAt: payload.exportedAt,
      tables: payload.tableCount, rows: payload.rowCount,
      tableNames: payload.tables.map(table => table.name),
      format: payload.format,
      message: 'Encrypted file decrypted and checksum verified. Database restore has not been attempted.',
    });
  }
  const bytes = new Uint8Array(archive);
  return new Response(bytes.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

/** Delete only a validated storage path; manual backups are never automatically pruned. */
export const DELETE = route(async req => {
  const user = await requirePermission('backups.manage');
  const path = await deleteStoredBackup(pathFrom(req));
  try { await audit(user.id, 'DATABASE_BACKUP_DELETED', 'backup', path); }
  catch (error) { console.error('Backup deleted, but audit logging failed:', error); }
  return ok({ deleted: path });
});
