/** Reuse one authenticated Server-Sent Events stream across all live queries. */
type Listener = () => void;
const listeners = new Set<Listener>();
let source: EventSource | null = null;
function notify() { for (const listener of listeners) listener(); }
export function subscribeToLiveChanges(listener: Listener) {
  listeners.add(listener);
  if (typeof window !== 'undefined' && !source) {
    source = new EventSource('/api/events');
    source.addEventListener('change', notify);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && source) { source.close(); source = null; }
  };
}
