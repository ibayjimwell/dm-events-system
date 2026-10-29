/** Pure request-refresh guards shared by live-query subscribers. */
export const FOCUS_REFRESH_MIN_INTERVAL_MS = 30_000;

/** If the source is an older bridge without a table label, refresh conservatively. */
export function shouldInvalidateForKind(kind: string | undefined, allowedKindsKey: string): boolean {
  if (!allowedKindsKey || !kind) return true;
  return allowedKindsKey.split('|').includes(kind);
}

/** Ignore consecutive focus events that would trigger the same API request. */
export function isFocusRefreshDue(now: number, lastFocusRefresh: number): boolean {
  return now - lastFocusRefresh >= FOCUS_REFRESH_MIN_INTERVAL_MS;
}
