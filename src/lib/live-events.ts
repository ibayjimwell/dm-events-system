import { invalidateQuerySnapshots } from '@/lib/query-cache';
/** A single shared authenticated SSE stream per browser tab. */
type Listener = (kind?: string) => void;
export type ChatEvent = {
  kind: 'message' | 'read' | 'typing' | 'disconnected';
  bookingId?: string;
  userId?: string;
  typing?: boolean;
  expiresAt?: string;
};
const listeners = new Set<Listener>();
const chatListeners = new Set<(event: ChatEvent) => void>();
let source: EventSource | null = null;
let idleClose: ReturnType<typeof setTimeout> | null = null;

/** End the authenticated stream immediately when signing out. */
export function closeLiveEvents() {
  if (idleClose) clearTimeout(idleClose);
  idleClose = null;
  source?.close();
  source = null;
}

function ensureSource() {
  if (idleClose) { clearTimeout(idleClose); idleClose = null; }
  if (typeof window === 'undefined' || source) return;
  source = new EventSource('/api/events');
  source.addEventListener('change', event => {
    // Use only the source table identifier, never any private row content.
    let kind: string | undefined;
    try {
      const payload = JSON.parse((event as MessageEvent).data) as { kind?: unknown };
      if (typeof payload.kind === 'string') kind = payload.kind;
    } catch { /* Older deployments may emit no structured payload. */ }
    invalidateQuerySnapshots();
    listeners.forEach(fn => fn(kind));
  });
  source.addEventListener('chat', event => {
    try {
      const payload = JSON.parse((event as MessageEvent).data) as ChatEvent;
      if (['message', 'read', 'typing', 'disconnected'].includes(payload.kind)) {
        if (payload.kind === 'message' || payload.kind === 'read') invalidateQuerySnapshots();
        chatListeners.forEach(fn => fn(payload));
      }
    } catch { /* ignore malformed / stale events */ }
  });
}
function maybeClose() {
  if (!listeners.size && !chatListeners.size && source && !idleClose) {
    // Route components may unmount/remount during a client-side transition.
    // Reuse the same stream rather than reconnecting to Supabase every click.
    idleClose = setTimeout(() => {
      idleClose = null;
      if (!listeners.size && !chatListeners.size) closeLiveEvents();
    }, 1500);
  }
}
export function subscribeToLiveChanges(listener: Listener) {
  listeners.add(listener);
  ensureSource();
  return () => { listeners.delete(listener); maybeClose(); };
}
export function subscribeToChatEvents(listener: (event: ChatEvent) => void) {
  chatListeners.add(listener);
  ensureSource();
  return () => { chatListeners.delete(listener); maybeClose(); };
}
