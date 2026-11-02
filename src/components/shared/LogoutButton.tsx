'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOut } from 'lucide-react';

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button type="button" className="btn btn-outline inline-flex items-center gap-2" disabled={busy}
    onClick={async () => {
      setBusy(true);
      try {
        const response = await fetch('/api/auth/logout', {method:'POST', credentials:'same-origin'});
        if (!response.ok) throw new Error('Sign out failed');
        router.replace('/login');
        router.refresh();
      } catch { setBusy(false); }
    }}>
    <LogOut size={16}/> {busy ? 'Signing out…' : 'Sign out'}
  </button>;
}
