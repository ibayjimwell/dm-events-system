import { z } from 'zod';
import { requirePermission } from '@/lib/access';
import { route } from '@/lib/http';
import { getStoredBackup } from '@/lib/backupManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = route(async (_req, context: { params: Promise<{ id: string }> }) => {
  await requirePermission('backups.manage');
  const { id } = await context.params;
  const result = await getStoredBackup(z.string().uuid().parse(id));
  const contents = new Uint8Array(result.bytes);
  return new Response(contents.buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': String(contents.byteLength),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
