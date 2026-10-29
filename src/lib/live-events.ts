/** A single shared authenticated SSE stream per browser tab. */
type Listener = () => void;
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

function ensureSource() {
  if (typeof window === 'undefined' || source) return;
  source = new EventSource('/api/events');
  source.addEventListener('change', () => listeners.forEach(fn => fn()));
  source.addEventListener('chat', event => {
    try {
      const payload = JSON.parse((event as MessageEvent).data) as ChatEvent;
      if (['message', 'read', 'typing', 'disconnected'].includes(payload.kind)) {
        chatListeners.forEach(fn => fn(payload));
      }
    } catch { /* ignore malformed / stale events */ }
  });
}
function maybeClose() {
  if (!listeners.size && !chatListeners.size && source) {
    source.close(); source = null;
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
