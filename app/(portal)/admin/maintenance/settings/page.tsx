import Link from 'next/link';
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
  // A missing permission is not a missing route. Show a helpful access message
  // instead of Next.js's misleading generic 404. The APIs still enforce RBAC.
  if (!canSettings && !canBackups) {
    const home = user.role === 'COORDINATOR' ? '/coordinator' : '/admin';
    return <main className="page-wrap page-space workspace">
      <section className="workspace-card mx-auto max-w-2xl p-6" role="alert">
        <h1 className="text-2xl font-bold text-slate-900">Access restricted</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Your account does not have System Settings or Backup Management permission. Ask an administrator to review your module access.</p>
        <Link href={home} className="btn mt-5 inline-flex">Return to dashboard</Link>
      </section>
    </main>;
  }

  const params = await searchParams;
  const requested = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const initialTab = requested === 'backups' && canBackups ? 'backups'
    : canSettings ? 'policy' : 'backups';

  return <SettingsHub canSettings={canSettings} canBackups={canBackups} initialTab={initialTab} />;
}
