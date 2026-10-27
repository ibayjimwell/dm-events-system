'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  subscribeApiActivity, getPendingApiCount, getServerPendingApiCount,
} from '@/lib/api-activity';

/** Persistent across App Router transitions; reflects every request made through api()/uploadImage(). */
export default function GlobalNetworkSkeleton() {
  const count = useSyncExternalStore(subscribeApiActivity, getPendingApiCount, getServerPendingApiCount);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!count) { setVisible(false); return; }
    const timeout = window.setTimeout(() => setVisible(true), 140);
    return () => window.clearTimeout(timeout);
  }, [count]);
  if (!count || !visible) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[110]" role="status" aria-live="polite" aria-label="Updating DM Events data">
      <div className="h-1 w-full overflow-hidden bg-[#dbe8f6]">
        <div className="h-full w-1/3 animate-[dm-loading_1.25s_ease-in-out_infinite] rounded-full bg-[#0b4d98]" />
      </div>
      <span className="sr-only">Loading or saving changes</span>
    </div>
  );
}
