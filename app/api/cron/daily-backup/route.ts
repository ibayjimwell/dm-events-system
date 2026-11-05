import { createStoredBackup, getStoredBackupSchedule, managedBackupConfig } from '@/lib/managedBackupStore';
import { shouldRunBackup } from '@/lib/backupSchedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * One daily Vercel cron endpoint, compatible with Hobby.
 * Stored Daily/Weekly/Monthly preference decides whether today's run executes.
 * Vercel supplies Authorization: Bearer CRON_SECRET in Production.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET || '';
  const incoming = req.headers.get('authorization') || '';
  if (secret.length < 16 || incoming !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    if (!managedBackupConfig().ready) {
      return Response.json({ ok: false, error: 'Backup storage is not configured. Check the Production environment variables.' }, {
        status: 503, headers: { 'Cache-Control': 'no-store' },
      });
    }
    const schedule = await getStoredBackupSchedule();
    if (!shouldRunBackup(schedule.frequency)) {
      return Response.json({ ok: true, skipped: true, frequency: schedule.frequency, message: 'Not scheduled for today in Asia/Manila.' }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    const result = await createStoredBackup('automatic');
    return Response.json({
      ok: true,
      skipped: false,
      frequency: schedule.frequency,
      alreadyExisted: result.alreadyExisted,
      path: result.backup.path,
      message: 'Encrypted database snapshot saved to private Supabase Storage.',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[DM Events scheduled backup] Automatic snapshot failed:', error);
    return Response.json({ ok: false, error: 'Scheduled backup failed. Review Vercel function logs.' }, {
      status: 500, headers: { 'Cache-Control': 'no-store' },
    });
  }
}
