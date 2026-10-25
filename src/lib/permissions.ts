/** Permission catalog: a grant changes capabilities, never the user's identity. */
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
  { key:'messages.staff', group:'Messaging', label:'Coordinator messages', description:'Read and reply to booking conversations' },
  { key:'analytics.view', group:'Administrator', label:'Monthly analytics', description:'View all confirmed booking values' },
  { key:'analytics.export', group:'Administrator', label:'Export analytics', description:'Download confirmed bookings report CSV' },
  { key:'packages.manage', group:'Administrator', label:'Manage packages', description:'Create, edit, publish and delete packages' },
  { key:'content.manage', group:'Administrator', label:'Website content', description:'Edit homepage, contact details and privacy policy' },
  { key:'backups.manage', group:'Administrator', label:'Encrypted backups', description:'Create and inspect encrypted database backup history' },
  { key:'settings.manage', group:'Administrator', label:'System settings', description:'Update application backup policy' },
  { key:'users.manage', group:'Security', label:'Accounts and permissions', description:'Manage accounts, roles and grants', adminOnly:true },
  { key:'profile.edit', group:'Account', label:'Own profile', description:'Update your own account profile' },
] as const;
export type Permission = (typeof MODULES)[number]['key'];
export type Role = 'CLIENT' | 'COORDINATOR' | 'ADMIN';
export const PERMISSION_KEYS = MODULES.map(p => p.key) as Permission[];
export const ADMIN_ONLY = new Set<Permission>(['users.manage']);
/** Staff use walk-in workflows; they cannot impersonate an authenticated client. */
export const CLIENT_IDENTITY_PERMISSIONS = new Set<Permission>(['dashboard.client','bookings.view.own','bookings.create.own','bookings.edit.own','bookings.cancel.own','messages.own']);
export const DEFAULT_PERMISSIONS: Record<Exclude<Role,'ADMIN'>,readonly Permission[]> = {
  CLIENT:['dashboard.client','bookings.view.own','bookings.create.own','bookings.edit.own','bookings.cancel.own','messages.own','profile.edit'],
  COORDINATOR:['dashboard.coordinator','bookings.view.all','bookings.review','bookings.status','calendar.view','messages.staff','profile.edit'],
};
export const isPermission = (value:string):value is Permission => PERMISSION_KEYS.includes(value as Permission);
export const defaultAccess = (role:Role, permission:Permission) => role==='ADMIN'||DEFAULT_PERMISSIONS[role].includes(permission);
