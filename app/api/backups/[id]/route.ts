import { z } from 'zod';
import { requirePermission } from '@/lib/access';
import { route, ok } from '@/lib/http';
import { deleteStoredBackup } from '@/lib/backupManager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = route(async (_req, context: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission('backups.manage');
  const { id } = await context.params;
  const parsed = z.string().uuid().parse(id);
  await deleteStoredBackup(parsed, user.id);
  return ok({ success: true });
});
