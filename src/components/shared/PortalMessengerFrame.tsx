'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { Role } from '@/lib/auth';
import type { Permission } from '@/lib/permissions';
import SiteNav from '@/components/shared/SiteNav';
import Footer from '@/components/shared/Footer';

/**
 * Keep authenticated portal layouts mounted across App Router navigation.
 * Messaging has its own app-sized interface, so do not render the portal
 * navbar/footer on chat routes. No permission checks are moved client-side:
 * the server layout and each messaging page/API still enforce access.
 */
export default function PortalMessengerFrame({
  children,
  role,
  permissions,
  footerLabel,
}: {
  children: ReactNode;
  role: Role;
  permissions: Permission[];
  footerLabel: string;
}) {
  const pathname = usePathname();
  const inMessenger = /^\/(client|coordinator|admin)\/messages(?:\/|$)/.test(pathname);

  if (inMessenger) {
    return (
      <div className="fixed inset-0 flex h-[100dvh] w-full min-h-0 min-w-0 flex-col overflow-hidden bg-white" data-messenger-fullscreen="true">
        {children}
      </div>
    );
  }

  return (
    <>
      <SiteNav role={role} permissions={permissions} />
      {children}
      <Footer label={footerLabel} />
    </>
  );
}
