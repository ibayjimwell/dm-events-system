'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToLiveChanges } from '@/lib/live-events';

/** Client-side data fetching with real-time invalidation and safe request ordering. */
export function useLiveQuery<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const active = useRef(true);
  const refresh = useCallback(async () => {
    const requestId = ++sequence.current;
    if (active.current) { setLoading(true); setError(''); }
    try {
      const result = await load();
      if (active.current && requestId === sequence.current) setData(result);
    } catch (caught) {
      if (active.current && requestId === sequence.current) {
        setError(caught instanceof Error ? caught.message : 'Unable to load data');
      }
    } finally {
      if (active.current && requestId === sequence.current) setLoading(false);
    }
  // Dependencies intentionally reflect the caller's query keys, not its inline function identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    active.current = true;
    setData(null);
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeToLiveChanges(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 280);
    });
    return () => {
      active.current = false;
      ++sequence.current;
      window.removeEventListener('focus', onFocus);
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [refresh]);

  return { data, loading, error, refresh };
}
