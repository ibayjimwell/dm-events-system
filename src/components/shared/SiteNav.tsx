'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, BarChart3, CalendarDays, CalendarPlus,
  ChevronDown, ChevronRight, ClipboardList, FolderKanban,
  Home, LayoutDashboard, LogIn, LogOut, Menu, MessageCircle,
  Package, Settings2, ShieldCheck, UserRound, UsersRound, WalletCards,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { beginApiRequest } from '@/lib/api-activity';
import type { Role } from '@/lib/auth';
import type { Permission } from '@/lib/permissions';
import styles from './SiteNav.module.css';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
};
type NavGroup = { label: string; items: NavItem[] };

// Module access is supplied by the authenticated server layout. Hiding a link
// is a usability feature, not a substitute for server-side permission checks.
const publicLinks: NavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/packages', label: 'Packages', icon: Package },
  { href: '/client/book', label: 'Book an Event', icon: CalendarPlus },
  { href: '/client/messages', label: 'Messages', icon: MessageCircle },
];
const clientLinks: NavItem[] = [
  { href: '/client', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.client' },
  { href: '/client/bookings', label: 'My Bookings', icon: ClipboardList, permission: 'bookings.view.own' },
  { href: '/client/book', label: 'New Booking', icon: CalendarPlus, permission: 'bookings.create.own' },
  { href: '/client/messages', label: 'Messages', icon: MessageCircle, permission: 'messages.own' },
  { href: '/client/profile', label: 'Profile', icon: UserRound, permission: 'profile.edit' },
];
const coordinatorLinks: NavItem[] = [
  { href: '/coordinator', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.coordinator' },
  { href: '/coordinator/calendar', label: 'Calendar', icon: CalendarDays, permission: 'calendar.view' },
  { href: '/coordinator/requests', label: 'Event Requests', icon: ClipboardList, permission: 'bookings.view.all' },
  { href: '/coordinator/messages', label: 'Messages', icon: MessageCircle, permission: 'messages.staff' },
];
const adminLinks: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, permission: 'dashboard.admin' },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, permission: 'analytics.view' },
  { href: '/admin/calendar', label: 'Schedule', icon: CalendarDays, permission: 'calendar.view' },
  { href: '/admin/bookings', label: 'Bookings', icon: ClipboardList, permission: 'bookings.view.all' },
];
const maintenanceLinks: NavItem[] = [
  { href: '/admin/maintenance/packages', label: 'Manage Packages', icon: Package, permission: 'packages.manage' },
  { href: '/admin/maintenance/content', label: 'Website Content', icon: FolderKanban, permission: 'content.manage' },
  { href: '/admin/maintenance/backups', label: 'Backups', icon: WalletCards, permission: 'backups.manage' },
  { href: '/admin/maintenance/settings', label: 'System Settings', icon: Settings2, permission: 'settings.manage' },
  { href: '/admin/maintenance/notifications', label: 'Email & SMS Notifications', icon: MessageCircle, permission: 'settings.manage' },
  { href: '/admin/maintenance/users', label: 'User Access', icon: UsersRound, permission: 'users.manage' },
];
const extraAdminLinks: NavItem[] = [
  { href: '/admin', label: 'Administrator Overview', icon: LayoutDashboard, permission: 'dashboard.admin' },
  { href: '/admin/analytics', label: 'Monthly Analytics', icon: BarChart3, permission: 'analytics.view' },
  { href: '/admin/bookings', label: 'All Bookings', icon: ClipboardList, permission: 'bookings.view.all' },
];
const extraOperationsLinks: NavItem[] = [
  { href: '/coordinator', label: 'Operations Dashboard', icon: LayoutDashboard, permission: 'dashboard.coordinator' },
  { href: '/coordinator/calendar', label: 'Operations Calendar', icon: CalendarDays, permission: 'calendar.view' },
  { href: '/coordinator/requests', label: 'Event Requests', icon: ClipboardList, permission: 'bookings.view.all' },
  { href: '/coordinator/messages', label: 'Operations Messages', icon: MessageCircle, permission: 'messages.staff' },
];

const dashboardRoots = new Set(['/admin', '/coordinator', '/client']);
const matches = (pathname: string, href: string): boolean => {
  if (pathname === href) return true;
  if (href === '/' || dashboardRoots.has(href)) return false;
  return pathname.startsWith(`${href}/`);
};

const authPaths = new Set(['/login', '/register', '/forgot-password', '/reset-password', '/verify-email']);

export default function SiteNav({
  role = 'PUBLIC', signedIn = false, signedInRole, permissions = [],
}: {
  role?: Role | 'PUBLIC';
  signedIn?: boolean;
  signedInRole?: Role;
  permissions?: Permission[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const moreRef = useRef<HTMLDivElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const wasMobileOpen = useRef(false);

  const allowed = new Set(permissions);
  const visible = (items: NavItem[]) => items.filter(item => !item.permission || allowed.has(item.permission));
  const signedInHome = signedInRole === 'ADMIN' ? '/admin' : signedInRole === 'COORDINATOR' ? '/coordinator' : '/client';
  const portalHome = role === 'ADMIN' ? '/admin' : role === 'COORDINATOR' ? '/coordinator' : role === 'CLIENT' ? '/client' : '/';
  const primary = role === 'PUBLIC' ? publicLinks : role === 'CLIENT' ? visible(clientLinks) : role === 'COORDINATOR' ? visible(coordinatorLinks) : visible(adminLinks);
  const groups: NavGroup[] = role === 'PUBLIC' || role === 'CLIENT' ? [] : role === 'ADMIN'
    ? [
        { label: 'Booking tools', items: visible([{ href: '/admin/walk-in', label: 'New Walk-in Booking', icon: CalendarPlus, permission: 'bookings.create.walkin' }]) },
        { label: 'Website & administration', items: visible(maintenanceLinks) },
        { label: 'Operations', items: visible(extraOperationsLinks) },
      ]
    : [
        { label: 'Booking tools', items: visible([{ href: '/coordinator/walk-in', label: 'New Walk-in Booking', icon: CalendarPlus, permission: 'bookings.create.walkin' }]) },
        { label: 'Delegated administrator modules', items: visible([...extraAdminLinks, ...maintenanceLinks]) },
      ];
  const visibleGroups = groups.filter(group => group.items.length > 0);
  const hasSettings = visibleGroups.length > 0;
  const primaryActive = primary.some(item => matches(pathname, item.href));
  // A route like /admin must not mark both the Overview tab and More active.
  const settingsActive = !primaryActive && visibleGroups.some(group => group.items.some(item => matches(pathname, item.href)));
  const portalName = role === 'ADMIN' ? 'Administrator' : role === 'COORDINATOR' ? 'Coordinator' : role === 'CLIENT' ? 'Client portal' : 'Event planning & coordination';

  useEffect(() => {
    setMobileOpen(false);
    setMobileMoreOpen(false);
    setMoreOpen(false);
    setLogoutError('');
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const dismiss = (event: MouseEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreOpen(false);
        moreTriggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!mobileOpen) {
      if (wasMobileOpen.current) mobileTriggerRef.current?.focus();
      wasMobileOpen.current = false;
      return;
    }
    wasMobileOpen.current = true;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    mobileDrawerRef.current?.querySelector<HTMLButtonElement>('button[aria-label=\"Close menu\"]')?.focus();
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
      if (event.key === 'Tab') {
        const items = mobileDrawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
        if (!items?.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', dismiss);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', dismiss);
    };
  }, [mobileOpen]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setLogoutError('');
    const done = beginApiRequest();
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Unable to sign out. Please try again.');
      setMobileOpen(false);
      setMoreOpen(false);
      // Staff always return to staff login; clients return to the public site.
      router.replace(role === 'CLIENT' || role === 'PUBLIC' ? '/' : '/login');
      router.refresh();
    } catch {
      setLogoutError('Could not sign out. Check your connection and try again.');
    } finally {
      done();
      setSigningOut(false);
    }
  }

  const renderLink = (item: NavItem, inMenu = false) => {
    const active = matches(pathname, item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        prefetch={false}
        onClick={event => { if (pathname === item.href) event.preventDefault(); setMobileOpen(false); setMobileMoreOpen(false); setMoreOpen(false); }}
        aria-current={active ? 'page' : undefined}
        className={inMenu ? `${styles.groupLink} ${active ? styles.groupLinkActive : ''}` : `${styles.desktopLink} ${active ? styles.desktopLinkActive : ''}`}
      >
        <Icon size={17} strokeWidth={1.9} aria-hidden="true" className={styles.linkIcon} />
        <span>{item.label}</span>
        {inMenu && <ChevronRight size={15} className={styles.groupArrow} aria-hidden="true" />}
      </Link>
    );
  };

  if (role === 'PUBLIC' && authPaths.has(pathname)) {
    return (
      <header className="auth-top" aria-label="Authentication navigation">
        <Link href="/" prefetch={false} className={styles.authBrand} aria-label="DM Events, return to home">
          <span className={styles.authBrandMark}>DM</span>
          <span>DM EVENTS</span>
        </Link>
      </header>
    );
  }

  return (
    <header className={styles.header} data-dm-nav="responsive-v2">
      <div className={styles.headerInner}>
        <Link href={portalHome} prefetch={false} className={styles.brandLink} onClick={event => { if (pathname === portalHome) event.preventDefault(); }} aria-label={role === 'PUBLIC' ? 'DM Events home' : `Go to ${portalName} home`}>
          <span className={styles.brandImage}>
            <Image src="/images/dm-logo.jpg" alt="" width={39} height={39} priority className={styles.logo} />
          </span>
          <span className={styles.brandText}>
            <span className={styles.brandTitle}>DM EVENTS</span>
            <span className={styles.brandSubtitle}>{portalName}</span>
          </span>
        </Link>

        <nav className={styles.desktopNav} aria-label="Primary navigation">
          {primary.map(item => renderLink(item))}
          {hasSettings && (
            <div className={styles.moreWrap} ref={moreRef}>
              <button
                ref={moreTriggerRef}
                type="button"
                className={`${styles.desktopLink} ${styles.moreTrigger} ${settingsActive || moreOpen ? styles.desktopLinkActive : ''}`}
                aria-haspopup="true"
                aria-expanded={moreOpen}
                aria-controls="dm-more-menu"
                onClick={() => setMoreOpen(open => !open)}
              >
                <Settings2 size={17} strokeWidth={1.9} aria-hidden="true" />
                <span>More</span>
                <ChevronDown size={15} className={moreOpen ? styles.rotate : ''} aria-hidden="true" />
              </button>
              {moreOpen && (
                <div id="dm-more-menu" className={styles.moreMenu}>
                  <div className={styles.menuTitle}>Explore your workspace</div>
                  {visibleGroups.map(group => (
                    <section key={group.label} className={styles.group} aria-label={group.label}>
                      <div className={styles.groupTitle}>{group.label}</div>
                      {group.items.map(item => renderLink(item, true))}
                    </section>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        <div className={styles.desktopActions}>
          {role === 'PUBLIC' ? (
            <Link href={signedIn ? signedInHome : '/login'} prefetch={false} className={styles.primaryAction}>
              {signedIn ? <LayoutDashboard size={17} aria-hidden="true" /> : <LogIn size={17} aria-hidden="true" />}
              <span>{signedIn ? 'My dashboard' : 'Log in'}</span>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          ) : (
            <>
              <span className={styles.roleBadge}><ShieldCheck size={15} aria-hidden="true" />{role === 'ADMIN' ? 'Admin' : role === 'COORDINATOR' ? 'Staff' : 'Client'}</span>
              <button type="button" className={styles.logoutButton} onClick={signOut} disabled={signingOut} title="Sign out">
                <LogOut size={17} aria-hidden="true" /><span>{signingOut ? 'Signing out…' : 'Log out'}</span>
              </button>
            </>
          )}
        </div>
        <button
          type="button"
          ref={mobileTriggerRef}
          aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={mobileOpen}
          aria-controls="dm-mobile-navigation"
          className={styles.mobileToggle}
          onClick={() => { setMobileOpen(open => !open); setMoreOpen(false); }}
        >
          {mobileOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
      </div>

      {logoutError && <div role="alert" className={styles.logoutError}>{logoutError}</div>}

      {mobileOpen && (
        <div id="dm-mobile-navigation" className={styles.mobileOverlay} role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button type="button" className={styles.mobileBackdrop} aria-label="Close navigation drawer" onClick={() => setMobileOpen(false)} />
          <nav ref={mobileDrawerRef} className={styles.mobileDrawer} aria-label="Mobile navigation">
            <div className={styles.drawerHeading}>
              <div>
                <span className={styles.drawerEyebrow}>DM Events</span>
                <strong>{role === 'PUBLIC' ? 'Explore DM Events' : portalName}</strong>
              </div>
              <button type="button" className={styles.drawerClose} aria-label="Close menu" onClick={() => setMobileOpen(false)}><X size={20} /></button>
            </div>
            <div className={styles.drawerBody}>
              <div className={styles.mobileSectionTitle}>Navigate</div>
              {primary.map(item => {
                const Icon = item.icon;
                const active = matches(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    onClick={event => { if (pathname === item.href) event.preventDefault(); setMobileOpen(false); }}
                    aria-current={active ? 'page' : undefined}
                    className={`${styles.mobileLink} ${active ? styles.mobileLinkActive : ''}`}
                  >
                    <Icon size={19} aria-hidden="true" /><span>{item.label}</span><ChevronRight size={16} className={styles.mobileArrow} aria-hidden="true" />
                  </Link>
                );
              })}
              {hasSettings && (
                <section className={styles.mobileMore}>
                  <button type="button" className={`${styles.mobileLink} ${settingsActive ? styles.mobileLinkActive : ''}`} aria-expanded={mobileMoreOpen} aria-controls="dm-mobile-more" onClick={() => setMobileMoreOpen(open => !open)}>
                    <Settings2 size={19} aria-hidden="true" /><span>More tools & settings</span><ChevronDown size={17} className={mobileMoreOpen ? styles.rotate : ''} aria-hidden="true" />
                  </button>
                  {mobileMoreOpen && (
                    <div id="dm-mobile-more" className={styles.mobileMoreContent}>
                      {visibleGroups.map(group => (
                        <section key={group.label} aria-label={group.label} className={styles.mobileGroup}>
                          <div className={styles.mobileSectionTitle}>{group.label}</div>
                          {group.items.map(item => {
                            const Icon = item.icon;
                            const active = matches(pathname, item.href);
                            return <Link key={item.href} href={item.href} prefetch={false} onClick={event => { if (pathname === item.href) event.preventDefault(); setMobileOpen(false); }} aria-current={active ? 'page' : undefined} className={`${styles.mobileLink} ${styles.mobileSubLink} ${active ? styles.mobileLinkActive : ''}`}><Icon size={17} aria-hidden="true" /><span>{item.label}</span></Link>;
                          })}
                        </section>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
            <div className={styles.drawerFooter}>
              {role === 'PUBLIC' ? (
                <Link className={styles.drawerAction} prefetch={false} href={signedIn ? signedInHome : '/login'} onClick={() => setMobileOpen(false)}><LogIn size={17} />{signedIn ? 'Open my dashboard' : 'Log in'}<ArrowRight size={17} /></Link>
              ) : (
                <button type="button" className={styles.drawerLogout} disabled={signingOut} onClick={signOut}><LogOut size={18} />{signingOut ? 'Signing out…' : 'Log out'}<ArrowRight size={17} /></button>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
