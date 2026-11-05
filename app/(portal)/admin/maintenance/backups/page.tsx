import { redirect } from 'next/navigation';

/**
 * Legacy bookmark compatibility. The live backup UI now resides inside the
 * existing System Settings route, not on a standalone page that may be missing
 * from an older Vercel deployment.
 */
export default function LegacyBackupsRedirect() {
  redirect('/admin/maintenance/settings?tab=backups');
}
