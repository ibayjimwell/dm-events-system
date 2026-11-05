import { requirePermission } from '@/lib/access';
import { route, ok, HttpError } from '@/lib/http';
import { audit } from '@/lib/auth';
import { deleteStoredBackup, readStoredBackup } from '@/lib/managedBackupStore';
import { previewBackupTable, summarizeBackup } from '@/lib/backupExplorer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function pathFrom(req: Request): string {
  const path = new URL(req.url).searchParams.get('path') || '';
  if (!path || path.length > 220) throw new HttpError(400, 'Backup path is missing or invalid.');
  return path;
}

/** Every inspection re-validates AES-GCM + SHA-256 before returning any data. */
export const GET = route(async req => {
  await requirePermission('backups.manage');
  const params = new URL(req.url).searchParams;
  const action = params.get('action') || 'download';
  if (!['inspect', 'records', 'download'].includes(action)) throw new HttpError(400, 'Invalid backup action.');
  const { archive, payload, filename } = await readStoredBackup(pathFrom(req));
  if (action === 'inspect') return ok(summarizeBackup(payload, filename));
  if (action === 'records') {
    const table = params.get('table') || '';
    const offsetText = params.get('offset') || '0';
    const limitText = params.get('limit') || '20';
    if (!/^(0|[1-9][0-9]{0,5})$/.test(offsetText) || !/^[1-9][0-9]?$/.test(limitText)) {
      throw new HttpError(400, 'Invalid preview pagination.');
    }
    try {
      return ok(previewBackupTable(payload, table, Number(offsetText), Number(limitText), params.get('q') || ''));
    } catch (cause) {
      throw new HttpError(400, cause instanceof Error ? cause.message : 'Invalid backup preview request.');
    }
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
