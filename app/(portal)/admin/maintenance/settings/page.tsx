import { redirect } from 'next/navigation';
import { requireActor } from '@/lib/auth';
import { permissionSet } from '@/lib/access';
import SettingsHub from '@/components/admin/SettingsHub';

// Keep all authorization on the server. A coordinator with only backups.manage
// may open the Backups tab without being able to edit the backup policy.
export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<{ tab?: string | string[] }> };

export default async function SystemSettingsPage({ searchParams }: PageProps) {
  const user = await requireActor();
  const permissions = await permissionSet(user);
  const canSettings = permissions.has('settings.manage');
  const canBackups = permissions.has('backups.manage');
  if (!canSettings && !canBackups) redirect('/access-denied');

  const params = await searchParams;
  const requested = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  // Do not silently open an unrelated tab when the requested section is denied.
  if (requested === 'backups' && !canBackups) redirect('/access-denied');
  if (requested === 'policy' && !canSettings) redirect('/access-denied');
  const initialTab = requested === 'backups' && canBackups ? 'backups'
    : canSettings ? 'policy' : 'backups';

  return <SettingsHub canSettings={canSettings} canBackups={canBackups} initialTab={initialTab} />;
}
