'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToLiveChanges } from '@/lib/live-events';
import { isFocusRefreshDue, shouldInvalidateForKind } from '@/lib/query-invalidation';

/** Client-side data fetching with real-time invalidation and safe request ordering. */
export type LiveQueryOptions = {
  /**
   * Most pages invalidate on generic Supabase data changes. Chat has its own
   * booking-scoped events: disabling generic invalidation prevents two
   * subscriptions from refetching the same thread after every message.
   */
  subscribeToChanges?: boolean;
  /** Disable focus refetch for views that manage their own live updates. */
  refreshOnFocus?: boolean;
  /** If set, ignore unrelated Realtime table changes (e.g. editing site content). */
  realtimeKinds?: readonly string[];
};

export function useLiveQuery<T>(
  load: () => Promise<T>,
  deps: unknown[] = [],
  options: LiveQueryOptions = {},
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const subscribeToChanges = options.subscribeToChanges !== false;
  const refreshOnFocus = options.refreshOnFocus !== false;
  const realtimeKindsKey = options.realtimeKinds?.join('|') ?? '';
  const lastFocusRefreshAt = useRef(0);
  const pendingRealtimeRefresh = useRef(false);
  // Keep the latest loader while maintaining a stable refresh callback.
  const loader = useRef(load);
  loader.current = load;
  const active = useRef(true);
  const refresh = useCallback(async () => {
    const requestId = ++sequence.current;
    if (active.current) { setLoading(true); setError(''); }
    try {
      const result = await loader.current();
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
    // Browser focus can fire repeatedly (DevTools, dialogs, switching windows).
    // Never refetch the same query dozens of times during focus churn.
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (!isFocusRefreshDue(now, lastFocusRefreshAt.current)) return;
      lastFocusRefreshAt.current = now;
      void refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (pendingRealtimeRefresh.current) {
        pendingRealtimeRefresh.current = false;
        lastFocusRefreshAt.current = Date.now();
        void refresh();
      } else if (refreshOnFocus) onFocus();
    };
    lastFocusRefreshAt.current = Date.now();
    if (refreshOnFocus) window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeToChanges
      ? subscribeToLiveChanges(kind => {
          // Only refresh queries affected by the changed table.
          if (!shouldInvalidateForKind(kind, realtimeKindsKey)) return;
          // Background tabs stay current on return, without flooding the API.
          if (document.visibilityState !== 'visible') {
            pendingRealtimeRefresh.current = true;
            return;
          }
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => void refresh(), 650);
        })
      : () => {};
    return () => {
      active.current = false;
      ++sequence.current;
      if (refreshOnFocus) window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [refresh, subscribeToChanges, refreshOnFocus, realtimeKindsKey]);

  return { data, loading, error, refresh };
}
