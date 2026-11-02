/**
 * Capabilities are assigned per account by the Mother Admin. A role determines
 * which capabilities may safely be assigned, never which ones are auto-granted.
 */
export const MODULES = [
  { key:'dashboard.client', group:'Dashboards', label:'Client dashboard', description:'View personal booking summary' },
  { key:'dashboard.coordinator', group:'Dashboards', label:'Coordinator dashboard', description:'Review operational summaries' },
  { key:'dashboard.admin', group:'Dashboards', label:'Administrator overview', description:'View organization-wide overview' },
  { key:'bookings.view.own', group:'Bookings', label:'My bookings', description:'View only bookings owned by the signed-in client' },
  { key:'bookings.create.own', group:'Bookings', label:'Submit own booking', description:'Submit an online booking as the signed-in client' },
  { key:'bookings.edit.own', group:'Bookings', label:'Edit own preferences', description:'Change tentative or held personal booking preferences' },
  { key:'bookings.cancel.own', group:'Bookings', label:'Request cancellation', description:'Request cancellation of an owned booking' },
  { key:'bookings.view.all', group:'Bookings', label:'All event requests', description:'View all bookings, including walk-ins' },
  { key:'bookings.review', group:'Bookings', label:'Review requests', description:'Open and coordinate incoming requests' },
  { key:'bookings.status', group:'Bookings', label:'Change booking status', description:'Hold, confirm, or cancel after conflict checks' },
  { key:'bookings.create.walkin', group:'Bookings', label:'Create walk-in booking', description:'Record an inquiry for a client without a login' },
  { key:'calendar.view', group:'Operations', label:'Event calendar', description:'Check organization-wide schedule' },
  { key:'messages.own', group:'Messaging', label:'Client messages', description:'Message staff about owned bookings' },
  { key:'messages.staff', group:'Messaging', label:'Staff messages', description:'Read and reply to booking conversations' },
  { key:'analytics.view', group:'Administrator', label:'Monthly analytics', description:'View all confirmed booking values' },
  { key:'analytics.export', group:'Administrator', label:'Export analytics', description:'Download confirmed bookings report CSV' },
  { key:'packages.manage', group:'Administrator', label:'Manage packages', description:'Create, edit, publish and delete packages' },
  { key:'content.manage', group:'Administrator', label:'Website content', description:'Edit homepage, contact details and privacy policy' },
  { key:'backups.manage', group:'Administrator', label:'Encrypted backups', description:'Create and inspect encrypted database backup history' },
  { key:'settings.manage', group:'Administrator', label:'System settings', description:'Update application backup policy' },
  { key:'users.manage', group:'Security', label:'Accounts and permissions', description:'Reserved for the Mother Admin to manage accounts, roles and grants', adminOnly:true },
  { key:'profile.edit', group:'Account', label:'Own profile', description:'Update your own account profile' },
] as const;
export type Permission = (typeof MODULES)[number]['key'];
export type Role = 'CLIENT' | 'COORDINATOR' | 'ADMIN';
export const PERMISSION_KEYS = MODULES.map(p => p.key) as Permission[];
/** Nobody can grant this capability: it belongs to the permanently designated Mother Admin. */
export const ADMIN_ONLY = new Set<Permission>(['users.manage']);
export const CLIENT_IDENTITY_PERMISSIONS = new Set<Permission>(['dashboard.client','bookings.view.own','bookings.create.own','bookings.edit.own','bookings.cancel.own','messages.own']);
/** The old implicit defaults are intentionally removed. */
export const DEFAULT_PERMISSIONS: Record<Role, readonly Permission[]> = {
  CLIENT: [], COORDINATOR: [], ADMIN: [],
};
export const isPermission = (value:string):value is Permission => PERMISSION_KEYS.includes(value as Permission);
export const defaultAccess = (_role:Role, _permission:Permission) => false;
/** Client self-service cannot expose staff data; staff cannot impersonate clients. */
export function canAssignPermission(role: Role, permission: Permission): boolean {
  if (ADMIN_ONLY.has(permission)) return false;
  if (role === 'CLIENT') return CLIENT_IDENTITY_PERMISSIONS.has(permission) || permission === 'profile.edit';
  return !CLIENT_IDENTITY_PERMISSIONS.has(permission);
}
