import type { Actor } from '@/lib/auth';
import { permissionSet } from '@/lib/access';

/** Select a real permitted page. A grant to an action without a landing page
 * must not trigger an infinite redirect or imply broader dashboard access. */
export async function portalHome(user: Actor): Promise<string> {
  const grants = await permissionSet(user);
  if (user.role === 'CLIENT') {
    if (grants.has('dashboard.client')) return '/client';
    if (grants.has('bookings.view.own')) return '/client/bookings';
    if (grants.has('bookings.create.own')) return '/client/book';
    if (grants.has('messages.own')) return '/client/messages';
    if (grants.has('profile.edit')) return '/client/profile';
    return '/access-pending';
  }

  if (grants.has('dashboard.admin')) return '/admin';
  if (grants.has('dashboard.coordinator')) return '/coordinator';
  if (grants.has('analytics.view')) return '/admin/analytics';
  if (grants.has('bookings.view.all')) return '/admin/bookings';
  if (grants.has('calendar.view')) return '/admin/calendar';
  if (grants.has('messages.staff')) return '/admin/messages';
  if (grants.has('bookings.create.walkin')) return '/admin/walk-in';
  if (grants.has('packages.manage')) return '/admin/maintenance/packages';
  if (grants.has('content.manage')) return '/admin/maintenance/content';
  if (grants.has('settings.manage') || grants.has('backups.manage')) return '/admin/maintenance/settings';
  if (grants.has('users.manage')) return '/admin/maintenance/users';
  return '/access-pending';
}
