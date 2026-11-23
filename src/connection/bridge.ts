import { actor } from '@/lib/auth';
import { can } from '@/lib/access';
import { readBookings } from '@/models/read';
import { realtimeServer } from '@/connection/server';
import { db } from '@/db';
import { bookings } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Authenticated Supabase Realtime -> same-origin SSE bridge.
 * DM Events uses custom HttpOnly-cookie sessions, not Supabase Auth. Its
 * service-role key and raw database rows MUST NOT reach browser clients.
 * No second EventSource is opened for messaging; this also serves other pages.
 */

type RealtimeRow = { new?: Record<string, unknown>; old?: Record<string, unknown> };
// Postgres Changes can provide only the primary key on DELETE when RLS is enabled.
// An unscoped 'sync' carries no data; each client reloads only its authorized records.
const STREAM_LIFETIME_MS = 50_000;

export async function realtimeEventStream(req: Request) {
  const user = await actor();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const [canViewAll, canChat, visibleBookings] = await Promise.all([
    can(user, 'bookings.view.all'),
    user.role === 'CLIENT' ? can(user, 'messages.own') : can(user, 'messages.staff'),
    readBookings(user),
  ]);
  const allowed = new Set(visibleBookings.map(b => b.id));

  let realtime: ReturnType<typeof realtimeServer>;
  try { realtime = realtimeServer(); }
  catch { return new Response('Realtime unavailable', { status: 503 }); }

  const encoder = new TextEncoder();
  let stop: (() => void) | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let lifetime: ReturnType<typeof setTimeout> | undefined;
      let channel: ReturnType<typeof realtime.channel> | undefined;

      const write = (event: 'change' | 'chat' | 'status', data: object) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); }
        catch { /* The browser has already closed the stream. */ }
      };

      // Other modules use the existing restricted booking visibility scope.
      const allowedBooking = (id: unknown) =>
        typeof id === 'string' && (canViewAll || allowed.has(id));

      // Staff messaging is independent from bookings.view.all; clients are
      // always restricted to bookings they actually own. Check an unknown
      // booking in the DB, as it may have been created AFTER SSE connected.
      const allowedChatBooking = async (id: unknown): Promise<boolean> => {
        if (!canChat || typeof id !== 'string') return false;
        if (user.role !== 'CLIENT' || allowed.has(id)) return true;
        try {
          const [booking] = await db.select({ clientId: bookings.clientId })
            .from(bookings).where(eq(bookings.id, id)).limit(1);
          if (booking?.clientId === user.id) {
            allowed.add(id);
            return true;
          }
        } catch (error) {
          console.error('Realtime booking authorization failed', error);
        }
        return false;
      };

      // Only the scoped booking ID and event TYPE are sent. Message bodies,
      // attachments, other users' names and credentials are never streamed.
      const emitChat = (rowId: unknown, kind: 'message' | 'thread' | 'read', genericKind?: string) => {
        void allowedChatBooking(rowId).then(isAllowed => {
          if (!isAllowed || closed) return;
          write('chat', { kind, bookingId: rowId });
          if (genericKind) write('change', { kind: genericKind });
        });
      };

      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (lifetime) clearTimeout(lifetime);
        req.signal.removeEventListener('abort', close);
        if (channel) void realtime.removeChannel(channel);
        try { controller.close(); } catch { /* already closed */ }
      };
      stop = close;
      req.signal.addEventListener('abort', close, { once: true });
      if (req.signal.aborted) { close(); return; }

      channel = realtime.channel(`dm-bridge-${user.id}-${crypto.randomUUID()}`);

      for (const table of ['bookings', 'booking_history', 'packages', 'site_content'] as const) {
        channel.on('postgres_changes', { schema: 'public', table, event: '*' }, payload => {
          const row = payload as RealtimeRow;
          const id = row.new?.id ?? row.old?.id;
          const historyBookingId = row.new?.booking_id ?? row.old?.booking_id;

          if (table === 'bookings') {
            // A newly created booking is a new inbox conversation even BEFORE
            // its first message. Do not rely on a pre-connection ID snapshot.
            const clientId = row.new?.client_id ?? row.old?.client_id;
            const visible = allowedBooking(id) || (user.role === 'CLIENT' && clientId === user.id);
            if (visible) write('change', { kind: table });
            if (canChat && typeof id === 'string' && (user.role !== 'CLIENT' || clientId === user.id || allowed.has(id))) {
              if (user.role === 'CLIENT') allowed.add(id);
              write('chat', { kind: 'thread', bookingId: id });
            }
            return;
          }
          if (table === 'booking_history' && !allowedBooking(historyBookingId)) return;
          write('change', { kind: table });
        });
      }

      channel.on('postgres_changes', { schema: 'public', table: 'messages', event: '*' }, payload => {
        const row = (payload as RealtimeRow).new ?? (payload as RealtimeRow).old;
        if (!row?.booking_id && payload.eventType === 'DELETE') {
          // The old DELETE tuple normally includes messages.id but not booking_id.
          // Do not drop the event: every authorized client reconciles its own inbox.
          if (canChat) write('chat', { kind: 'sync' });
          return;
        }
        emitChat(row?.booking_id, 'message', 'messages');
      });
      if (canChat) {
        channel.on('postgres_changes', { schema: 'public', table: 'message_thread_preferences', event: '*' }, payload => {
          const row = (payload as RealtimeRow).new ?? (payload as RealtimeRow).old;
          if (row?.user_id !== user.id) return;
          emitChat(row?.booking_id, 'thread');
        });
        channel.on('postgres_changes', { schema: 'public', table: 'message_thread_deletions', event: '*' }, payload => {
          const row = (payload as RealtimeRow).new ?? (payload as RealtimeRow).old;
          emitChat(row?.booking_id, 'thread');
        });
        channel.on('postgres_changes', { schema: 'public', table: 'message_reads', event: '*' }, payload => {
          const row = (payload as RealtimeRow).new ?? (payload as RealtimeRow).old;
          emitChat(row?.booking_id, 'read', 'message_reads');
        });
        channel.on('postgres_changes', { schema: 'public', table: 'message_typing', event: '*' }, payload => {
          const row = (payload as RealtimeRow).new ?? (payload as RealtimeRow).old;
          if (row?.user_id === user.id) return;
          void allowedChatBooking(row?.booking_id).then(isAllowed => {
            if (!isAllowed || closed) return;
            write('chat', {
              kind: 'typing', bookingId: row?.booking_id,
              userId: row?.user_id,
              typing: row?.is_typing === true,
              expiresAt: row?.expires_at,
            });
          });
        });
      }

      channel.subscribe(status => {
        if (closed) return;
        if (status === 'SUBSCRIBED') {
          // Reconcile writes occurring between initial HTTP loading and
          // the point when the PostgreSQL subscription became active.
          write('status', { kind: 'connected' });
          write('chat', { kind: 'sync' });
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('DM Events Realtime channel:', status);
          write('status', { kind: 'disconnected', reason: status });
          write('chat', { kind: 'disconnected' });
          // Force native EventSource to reconnect; a failed Supabase channel
          // must not stay attached to a permanently silent HTTP stream.
          close();
        }
      });
      controller.enqueue(encoder.encode('retry: 1500\n: connected\n\n'));
      heartbeat = setInterval(() => {
        if (!closed) {
          try { controller.enqueue(encoder.encode(': keepalive\n\n')); }
          catch { close(); }
        }
      }, 18_000);
      // Serverless functions have finite lifetimes. Reopen under a fresh
      // session/permission check before the platform forcibly terminates us.
      lifetime = setTimeout(close, STREAM_LIFETIME_MS);
    },
    cancel() { stop?.(); },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
