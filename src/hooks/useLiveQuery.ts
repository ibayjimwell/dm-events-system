'use client';

import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { subscribeToLiveChanges } from '@/lib/live-events';
import { isFocusRefreshDue, shouldInvalidateForKind } from '@/lib/query-invalidation';
import { readQuerySnapshot, writeQuerySnapshot } from '@/lib/query-cache';

export type LiveQueryOptions = {
  /** Chat has its own booking-scoped change stream. */
  subscribeToChanges?: boolean;
  refreshOnFocus?: boolean;
  realtimeKinds?: readonly string[];
  /** Stable, role-scoped key for instant return navigation; never include tokens. */
  cacheKey?: string;
  /** How long a previous result may be shown without a mount-time refetch. */
  staleTimeMs?: number;
};

/**
 * SPA-style stale-while-revalidate query.
 * Screens keep their last successful data during refreshes and never blank on
 * focus, Realtime, or a background mutation. A bounded in-memory snapshot makes
 * revisiting a route immediately useful rather than starting with an empty shell.
 * Server APIs remain the source of truth and enforce every permission.
 */
export function useLiveQuery<T>(
  load: () => Promise<T>,
  deps: unknown[] = [],
  options: LiveQueryOptions = {},
) {
  const key = options.cacheKey;
  const staleTime = options.staleTimeMs ?? 30_000;
  const initial = key ? readQuerySnapshot<T>(key) : null;
  const [data, setDataState] = useState<T | null>(() => initial?.value ?? null);
  const [resolvedKey, setResolvedKey] = useState(key);
  const [loading, setLoading] = useState(() => !initial);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const dataRef = useRef<T | null>(initial?.value ?? null);
  const keyRef = useRef(key);
  keyRef.current = key;
  const loader = useRef(load);
  loader.current = load;
  const sequence = useRef(0);
  const active = useRef(false);
  const lastFocusRefreshAt = useRef(0);
  const pendingRealtimeRefresh = useRef(false);
  const subscribeToChanges = options.subscribeToChanges !== false;
  const refreshOnFocus = options.refreshOnFocus !== false;
  const kinds = options.realtimeKinds?.join('|') ?? '';

  const setData = useCallback((change: SetStateAction<T | null>) => {
    setDataState(previous => {
      const next = typeof change === 'function'
        ? (change as (value: T | null) => T | null)(previous)
        : change;
      dataRef.current = next;
      if (next !== null && keyRef.current) writeQuerySnapshot(keyRef.current, next);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    const requestId = ++sequence.current;
    if (active.current) {
      if (dataRef.current === null) setLoading(true);
      else setRefreshing(true);
      setError('');
    }
    try {
      const result = await loader.current();
      if (active.current && requestId === sequence.current) {
        dataRef.current = result;
        setDataState(result);
        if (keyRef.current) writeQuerySnapshot(keyRef.current, result);
      }
    } catch (caught) {
      if (active.current && requestId === sequence.current) {
        setError(caught instanceof Error ? caught.message : 'Unable to load data');
      }
    } finally {
      if (active.current && requestId === sequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  // Query identity depends on explicitly provided keys, not inline function identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    active.current = true;
    const snapshot = key ? readQuerySnapshot<T>(key) : null;
    setResolvedKey(key);
    dataRef.current = snapshot?.value ?? null;
    setDataState(snapshot?.value ?? null);
    setError('');
    setLoading(!snapshot);
    setRefreshing(false);
    lastFocusRefreshAt.current = Date.now();
    const fresh = snapshot && Date.now() - snapshot.updatedAt <= staleTime;
    if (!fresh) void refresh();

    const focus = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (!isFocusRefreshDue(now, lastFocusRefreshAt.current)) return;
      lastFocusRefreshAt.current = now;
      void refresh();
    };
    const visible = () => {
      if (document.visibilityState !== 'visible') return;
      if (pendingRealtimeRefresh.current) {
        pendingRealtimeRefresh.current = false;
        lastFocusRefreshAt.current = Date.now();
        void refresh();
      } else if (refreshOnFocus) focus();
    };
    if (refreshOnFocus) window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visible);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeToChanges ? subscribeToLiveChanges(kind => {
      if (!shouldInvalidateForKind(kind, kinds)) return;
      if (document.visibilityState !== 'visible') {
        pendingRealtimeRefresh.current = true;
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 650);
    }) : () => {};

    return () => {
      active.current = false;
      ++sequence.current;
      if (refreshOnFocus) window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visible);
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, key, staleTime, subscribeToChanges, refreshOnFocus, kinds]);

  // Never display data from a different record while an id-based route changes.
  const shown = resolvedKey === key ? data : initial?.value ?? null;
  return { data: shown, loading: resolvedKey === key ? loading : !initial, refreshing, error, refresh, setData };
}
