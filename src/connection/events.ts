'use client';

import { invalidateQuerySnapshots } from '@/lib/query-cache';

/** The entire application shares ONE authenticated EventSource per browser tab. */
type ChangeListener = (kind?: string) => void;
export type ChatEvent = {
  kind: 'message' | 'read' | 'typing' | 'thread' | 'sync' | 'connected' | 'disconnected';
  bookingId?: string;
  userId?: string;
  typing?: boolean;
  expiresAt?: string;
};
type ChatListener = (event: ChatEvent) => void;

const listeners = new Set<ChangeListener>();
const chatListeners = new Set<ChatListener>();
let source: EventSource | null = null;
let idleClose: ReturnType<typeof setTimeout> | null = null;
let safetyRefresh: ReturnType<typeof setInterval> | null = null;
let reconnectRefresh: ReturnType<typeof setTimeout> | null = null;
let hasOpened = false;

const notifyChat = (event: ChatEvent) => { chatListeners.forEach(listener => listener(event)); };
const notifyChanges = (kind?: string) => { listeners.forEach(listener => listener(kind)); };

function resync() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  invalidateQuerySnapshots();
  notifyChat({ kind: 'sync' });
  notifyChanges();
}

/** Call on sign-out to discard this user's connection and pending timers. */
export function closeLiveEvents() {
  if (idleClose) clearTimeout(idleClose);
  if (reconnectRefresh) clearTimeout(reconnectRefresh);
  if (safetyRefresh) clearInterval(safetyRefresh);
  idleClose = null;
  reconnectRefresh = null;
  safetyRefresh = null;
  source?.close();
  source = null;
  hasOpened = false;
}

function ensureSource() {
  if (idleClose) { clearTimeout(idleClose); idleClose = null; }
  if (typeof window === 'undefined' || source) return;

  const connection = new EventSource('/api/events');
  source = connection;
  connection.addEventListener('open', () => {
    if (source !== connection) return;
    // Initial API queries load themselves. A *reconnection*, however, could
    // have missed any number of messages, reads or deleted/created threads.
    if (hasOpened) resync();
    hasOpened = true;
    if (reconnectRefresh) { clearTimeout(reconnectRefresh); reconnectRefresh = null; }
  });
  connection.addEventListener('change', event => {
    let kind: string | undefined;
    try {
      const payload = JSON.parse((event as MessageEvent).data) as { kind?: unknown };
      if (typeof payload.kind === 'string') kind = payload.kind;
    } catch { /* A malformed event should never break a subscription. */ }
    invalidateQuerySnapshots();
    notifyChanges(kind);
  });
  // HTTP 'open' is NOT proof that the underlying Supabase channel subscribed.
  // Report online only after an explicit SUBSCRIBED status from the bridge.
  connection.addEventListener('status', event => {
    try {
      const payload = JSON.parse((event as MessageEvent).data) as { kind?: string };
      if (payload.kind === 'connected') notifyChat({ kind: 'connected' });
      else if (payload.kind === 'disconnected') notifyChat({ kind: 'disconnected' });
    } catch { /* malformed status */ }
  });
  connection.addEventListener('chat', event => {
    try {
      const data = JSON.parse((event as MessageEvent).data) as ChatEvent;
      if (!['message', 'read', 'typing', 'thread', 'sync', 'connected', 'disconnected'].includes(data.kind)) return;
      if (data.kind === 'message' || data.kind === 'read' || data.kind === 'thread') invalidateQuerySnapshots();
      notifyChat(data);
    } catch { /* Ignore malformed or stale messages. */ }
  });
  connection.addEventListener('error', () => {
    if (source !== connection) return;
    notifyChat({ kind: 'disconnected' });
    // Native EventSource automatically reconnects. If the stream expires or
    // fails, resync after a short grace period even before it reconnects.
    if (!reconnectRefresh) reconnectRefresh = setTimeout(() => {
      reconnectRefresh = null;
      resync();
      // An EventSource in CLOSED state does not reconnect by itself.
      if (source === connection && connection.readyState === EventSource.CLOSED) {
        connection.close();
        source = null;
        if (listeners.size || chatListeners.size) ensureSource();
      }
    }, 3000);
  });

  // Safety reconciliation in case a deployment did not publish a table, or an
  // event was missed during an unstable mobile connection. Real changes still
  // arrive immediately; this is NOT the primary messaging transport.
  if (!safetyRefresh) safetyRefresh = setInterval(() => {
    if (chatListeners.size) resync();
  }, 30_000);
}

function maybeClose() {
  if (!listeners.size && !chatListeners.size && source && !idleClose) {
    // A short grace period avoids opening duplicate WebSockets on navigation.
    idleClose = setTimeout(() => {
      idleClose = null;
      if (!listeners.size && !chatListeners.size) closeLiveEvents();
    }, 1500);
  }
}

export function subscribeToLiveChanges(listener: ChangeListener) {
  listeners.add(listener);
  ensureSource();
  return () => { listeners.delete(listener); maybeClose(); };
}

export function subscribeToChatEvents(listener: ChatListener) {
  chatListeners.add(listener);
  ensureSource();
  return () => { chatListeners.delete(listener); maybeClose(); };
}
