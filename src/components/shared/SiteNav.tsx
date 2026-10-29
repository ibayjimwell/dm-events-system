'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { beginApiRequest } from '@/lib/api-activity';
import { ChevronDown, ChevronRight, LogOut, Menu, Settings2, X } from 'lucide-react';
import type { Role } from '@/lib/auth';
import type { Permission } from '@/lib/permissions';

type NavItem = {
  href: string;
  label: string;
  permission?: Permission;
};
type NavGroup = { label: string; items: NavItem[] };

const publicLinks: NavItem[] = [
  { href: '/', label: 'Home' },
  { href: '/packages', label: 'Packages' },
  { href: '/client/book', label: 'Book an Event' },
  { href: '/client/messages', label: 'Messages' },
];

const clientLinks: NavItem[] = [
  { href: '/client', label: 'Dashboard', permission: 'dashboard.client' },
  { href: '/client/bookings', label: 'My Bookings', permission: 'bookings.view.own' },
  { href: '/client/messages', label: 'Messages', permission: 'messages.own' },
  { href: '/client/profile', label: 'Profile', permission: 'profile.edit' },
];

const coordinatorLinks: NavItem[] = [
  { href: '/coordinator', label: 'Dashboard', permission: 'dashboard.coordinator' },
  { href: '/coordinator/calendar', label: 'Calendar', permission: 'calendar.view' },
  { href: '/coordinator/requests', label: 'Event Requests', permission: 'bookings.view.all' },
  { href: '/coordinator/messages', label: 'Messages', permission: 'messages.staff' },
];

const adminLinks: NavItem[] = [
  { href: '/admin', label: 'Overview', permission: 'dashboard.admin' },
  { href: '/admin/analytics', label: 'Analytics', permission: 'analytics.view' },
  { href: '/admin/calendar', label: 'Schedule', permission: 'calendar.view' },
  { href: '/admin/bookings', label: 'Bookings', permission: 'bookings.view.all' },
];

const maintenanceLinks: NavItem[] = [
  { href: '/admin/maintenance/packages', label: 'Manage Packages', permission: 'packages.manage' },
  { href: '/admin/maintenance/content', label: 'Website Content', permission: 'content.manage' },
  { href: '/admin/maintenance/backups', label: 'Backups', permission: 'backups.manage' },
  { href: '/admin/maintenance/settings', label: 'System Settings', permission: 'settings.manage' },
  { href: '/admin/maintenance/notifications', label: 'Email & SMS Notifications', permission: 'settings.manage' },
  { href: '/admin/maintenance/users', label: 'User Access', permission: 'users.manage' },
];

const extraAdminLinks: NavItem[] = [
  { href: '/admin', label: 'Administrator Overview', permission: 'dashboard.admin' },
  { href: '/admin/analytics', label: 'Monthly Analytics', permission: 'analytics.view' },
  { href: '/admin/bookings', label: 'All Bookings', permission: 'bookings.view.all' },
];

const extraOperationsLinks: NavItem[] = [
  { href: '/coordinator', label: 'Operations Dashboard', permission: 'dashboard.coordinator' },
  { href: '/coordinator/calendar', label: 'Operations Calendar', permission: 'calendar.view' },
  { href: '/coordinator/requests', label: 'Event Requests', permission: 'bookings.view.all' },
  { href: '/coordinator/messages', label: 'Operations Messages', permission: 'messages.staff' },
];

// Top-level dashboard URLs must match exactly. Otherwise `/admin` would also
// match `/admin/analytics`, and `/coordinator` would match every staff screen.
// Child screens (e.g. `/coordinator/requests/[id]`) keep their parent tab active.
const dashboardRoots = new Set(['/admin', '/coordinator', '/client']);

const matches = (pathname: string, href: string): boolean => {
  if (pathname === href) return true;
  if (href === '/' || dashboardRoots.has(href)) return false;
  return pathname.startsWith(`${href}/`);
};

const mainLink = 'inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

export default function SiteNav({
  role = 'PUBLIC',
  signedIn = false,
  signedInRole,
  permissions = [],
}: {
  role?: Role | 'PUBLIC';
  signedIn?: boolean;
  signedInRole?: Role;
  permissions?: Permission[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileSettingsRef = useRef<HTMLDivElement>(null);
  const allowed = new Set(permissions);
  const visible = (items: NavItem[]) => items.filter(item => !item.permission || allowed.has(item.permission));

  const signedInHome = signedInRole === 'ADMIN' ? '/admin' : signedInRole === 'COORDINATOR' ? '/coordinator' : '/client';

  const primary = role === 'PUBLIC'
    ? publicLinks
    : role === 'CLIENT'
      ? visible(clientLinks)
      : role === 'COORDINATOR'
        ? visible(coordinatorLinks)
        : visible(adminLinks);

  const groups: NavGroup[] = role === 'PUBLIC' || role === 'CLIENT'
    ? []
    : role === 'ADMIN'
      ? [
          { label: 'Booking tools', items: visible([{ href: '/admin/walk-in', label: 'New Walk-in Booking', permission: 'bookings.create.walkin' }]) },
          { label: 'Website & administration', items: visible(maintenanceLinks) },
          { label: 'Operations', items: visible(extraOperationsLinks) },
        ]
      : [
          { label: 'Booking tools', items: visible([{ href: '/coordinator/walk-in', label: 'New Walk-in Booking', permission: 'bookings.create.walkin' }]) },
          { label: 'Delegated administrator modules', items: visible([...extraAdminLinks, ...maintenanceLinks]) },
        ];

  const visibleGroups = groups.filter(group => group.items.length > 0);
  const hasSettings = visibleGroups.length > 0;
  const settingsActive = visibleGroups.some(group => group.items.some(item => matches(pathname, item.href)));

  useEffect(() => {
    setMobileOpen(false);
    setSettingsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !mobileSettingsRef.current?.contains(target)) setSettingsOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [settingsOpen]);

  async function signOut() {
    setMobileOpen(false);
    setSettingsOpen(false);
    const done = beginApiRequest();
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      done();
    }
    router.replace(role === 'CLIENT' || role === 'PUBLIC' ? '/' : '/login');
    router.refresh();
  }

  if (role === 'PUBLIC' && ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'].includes(pathname)) {
    return (
      <header className="auth-top">
        <Link href="/" className="brand text-white no-underline">DM EVENTS</Link>
      </header>
    );
  }

  const renderLink = (item: NavItem, inMenu = false) => {
    const active = matches(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        prefetch={item.href.endsWith('/messages') ? false : undefined}
        onClick={() => { setMobileOpen(false); setSettingsOpen(false); }}
        aria-current={active ? 'page' : undefined}
        className={inMenu
          ? `flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${active ? 'bg-[#eaf2fc] font-semibold text-[#0b4d98]' : 'text-[#263d58] hover:bg-[#f1f6fa]'}`
          : `${mainLink} ${active ? 'bg-white/15 text-white' : 'text-[#cbd9e9] hover:bg-white/10 hover:text-white'}`}
      >
        <span className="min-w-0 break-words">{item.label}</span>
        {inMenu && <ChevronRight size={15} className="shrink-0 opacity-50" aria-hidden="true" />}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#071f3b] text-white shadow-[0_4px_14px_rgba(5,24,45,0.12)]">
      <div className="mx-auto flex min-h-[70px] w-full max-w-[1210px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href={role==='ADMIN'?'/admin':role==='COORDINATOR'?'/coordinator':'/'} className="brand shrink-0 whitespace-nowrap text-[23px] font-bold leading-none tracking-wide text-white no-underline" aria-label="DM Events home">
          DM EVENTS
        </Link>

        <nav aria-label="Primary navigation" className="hidden min-w-0 items-center gap-1 lg:flex">
          {primary.map(item => renderLink(item))}

          {hasSettings && (
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setSettingsOpen(current => !current)}
                aria-expanded={settingsOpen}
                aria-controls="dm-settings-menu"
                aria-haspopup="true"
                className={`${mainLink} gap-2 ${settingsActive || settingsOpen ? 'bg-white/15 text-white' : 'text-[#cbd9e9] hover:bg-white/10 hover:text-white'}`}
              >
                <Settings2 size={16} aria-hidden="true" />
                More
                <ChevronDown size={15} aria-hidden="true" className={`transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
              </button>
              {settingsOpen && (
                <div id="dm-settings-menu" className="absolute right-0 top-[calc(100%+10px)] z-[60] max-h-[min(75vh,650px)] w-[min(340px,calc(100vw-32px))] overflow-y-auto rounded-xl border border-[#dae4ed] bg-white p-3 text-[#122c44] shadow-2xl">
                  {visibleGroups.map(group => (
                    <section key={group.label} className="mb-2 border-b border-[#e6edf3] pb-2 last:mb-0 last:border-0 last:pb-0">
                      <p role="heading" aria-level={2} className="px-3 pb-1 pt-2 font-sans text-xs font-semibold leading-5 uppercase tracking-[0.08em] text-[#72849a]">{group.label}</p>
                      {group.items.map(item => renderLink(item, true))}
                    </section>
                  ))}
                </div>
              )}
            </div>
          )}

          {role === 'PUBLIC'
            ? <Link href={signedIn ? signedInHome : '/login'} className={`${mainLink} ml-2 bg-[#0b4d98] text-white hover:bg-[#2762a6]`}>{signedIn ? 'Dashboard' : 'Log in'}</Link>
            : <button type="button" onClick={signOut} className={`${mainLink} ml-2 gap-2 text-[#cbd9e9] hover:bg-white/10 hover:text-white`}><LogOut size={16} aria-hidden="true" /> Log out</button>}
        </nav>

        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/20 text-white hover:bg-white/10 lg:hidden"
          aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={mobileOpen}
          aria-controls="dm-mobile-navigation"
          onClick={() => { setMobileOpen(v => !v); setSettingsOpen(false); }}
        >
          {mobileOpen ? <X size={23} /> : <Menu size={23} />}
        </button>
      </div>

      {mobileOpen && (
        <nav id="dm-mobile-navigation" aria-label="Mobile navigation" className="max-h-[calc(100dvh-70px)] overflow-y-auto border-t border-white/10 px-4 pb-4 pt-2 lg:hidden">
          <div className="mx-auto max-w-[1210px] space-y-1">
            {primary.map(item => renderLink(item))}
            {hasSettings && (
              <div ref={mobileSettingsRef} className="border-t border-white/10 pt-2">
                <button
                  type="button"
                  onClick={() => setSettingsOpen(v => !v)}
                  aria-expanded={settingsOpen}
                  aria-controls="dm-mobile-settings"
                  className={`${mainLink} flex w-full justify-between gap-3 ${settingsActive || settingsOpen ? 'bg-white/15 text-white' : 'text-[#cbd9e9]'}`}
                >
                  <span className="flex items-center gap-2"><Settings2 size={17} aria-hidden="true" />More</span>
                  <ChevronDown size={18} className={settingsOpen ? 'rotate-180' : ''} aria-hidden="true" />
                </button>
                {settingsOpen && (
                  <div id="dm-mobile-settings" className="mt-2 space-y-3 rounded-lg bg-white p-2 text-[#122c44]">
                    {visibleGroups.map(group => (
                      <section key={group.label}>
                        <p role="heading" aria-level={2} className="px-3 py-2 font-sans text-xs font-semibold leading-5 uppercase tracking-[0.08em] text-[#72849a]">{group.label}</p>
                        {group.items.map(item => renderLink(item, true))}
                      </section>
                    ))}
                  </div>
                )}
              </div>
            )}
            {role === 'PUBLIC'
              ? <Link href={signedIn ? signedInHome : '/login'} onClick={() => setMobileOpen(false)} className={`${mainLink} flex bg-[#0b4d98] text-white`}>{signedIn ? 'Dashboard' : 'Log in'}</Link>
              : <button type="button" onClick={signOut} className={`${mainLink} flex w-full gap-2 border-t border-white/10 text-left text-[#cbd9e9]`}><LogOut size={16} /> Log out</button>}
          </div>
        </nav>
      )}
    </header>
  );
}
