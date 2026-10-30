/**
 * In-memory, tab-local snapshots for authenticated application screens.
 * No persistence: values are cleared on login/logout and mutations.
 * Only non-secret response data already visible to the signed-in user is stored.
 */
const MAX_ENTRIES = 80;
const snapshots = new Map<string, { value: unknown; updatedAt: number }>();

export function readQuerySnapshot<T>(key: string): { value: T; updatedAt: number } | null {
  const entry = snapshots.get(key);
  if (!entry) return null;
  // Touch for bounded LRU eviction.
  snapshots.delete(key);
  snapshots.set(key, entry);
  return entry as { value: T; updatedAt: number };
}

export function writeQuerySnapshot<T>(key: string, value: T): void {
  snapshots.delete(key);
  snapshots.set(key, { value, updatedAt: Date.now() });
  while (snapshots.size > MAX_ENTRIES) {
    const oldest = snapshots.keys().next().value;
    if (!oldest) break;
    snapshots.delete(oldest);
  }
}

/** Invalidation does not wipe currently rendered state; refetches remain quiet. */
export function invalidateQuerySnapshots(): void {
  snapshots.clear();
}

export function querySnapshotCount(): number { return snapshots.size; }
