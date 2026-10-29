import { actor } from '@/lib/auth';
import { can } from '@/lib/access';
import { readBookings } from '@/models/read';
import { realtimeServer } from '@/connections/realtime';

/**
 * Authenticated same-origin Supabase Realtime -> SSE bridge.
 * Browser clients use DM Events' existing cookie-based sessions, NOT Supabase Auth;
 * privileged Supabase keys and raw private row data must never reach the browser.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type RealtimeRow = { new?: Record<string, unknown>; old?: Record<string, unknown> };
export async function GET(req: Request) {
  const user = await actor();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const [canViewAll, canChat, bookings] = await Promise.all([
    can(user, 'bookings.view.all'),
    user.role === 'CLIENT' ? can(user, 'messages.own') : can(user, 'messages.staff'),
    readBookings(user),
  ]);
  const allowed = new Set(bookings.map(b => b.id));
  let realtime: ReturnType<typeof realtimeServer>;
  try { realtime = realtimeServer(); }
  catch { return new Response('Realtime unavailable', { status: 503 }); }

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (event: string, data: object) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); }
        catch { /* closed stream */ }
      };
      const allowedBooking = (id: unknown) => typeof id === 'string' && (canViewAll || allowed.has(id));
      const channel = realtime.channel(`dm-bridge-${user.id}-${crypto.randomUUID()}`);
      for (const table of ['bookings', 'booking_history', 'packages', 'site_content']) {
        channel.on('postgres_changes', { schema: 'public', table, event: '*' }, payload => {
          const p = payload as RealtimeRow;
          if (table === 'bookings' && !allowedBooking(p.new?.id ?? p.old?.id)) return;
          if (table === 'booking_history' && !allowedBooking(p.new?.booking_id ?? p.old?.booking_id)) return;
          write('change', { kind: table });
        });
      }
      channel.on('postgres_changes', { schema: 'public', table: 'messages', event: '*' }, payload => {
        const row = (payload as RealtimeRow).new;
        if (!allowedBooking(row?.booking_id)) return;
        if (canChat) write('chat', { kind: 'message', bookingId: row?.booking_id });
        write('change', { kind: 'messages' });
      });
      if (canChat) {
        channel.on('postgres_changes', { schema: 'public', table: 'message_reads', event: '*' }, payload => {
          const row = (payload as RealtimeRow).new;
          if (!allowedBooking(row?.booking_id)) return;
          write('chat', { kind: 'read', bookingId: row?.booking_id });
        });
        channel.on('postgres_changes', { schema: 'public', table: 'message_typing', event: '*' }, payload => {
          const row = (payload as RealtimeRow).new;
          if (!allowedBooking(row?.booking_id) || row?.user_id === user.id) return;
          write('chat', {
            kind: 'typing', bookingId: row?.booking_id,
            userId: row?.user_id,
            typing: row?.is_typing === true,
            expiresAt: row?.expires_at,
          });
        });
      }
      channel.subscribe(status => {
        // The query hook loads initial data itself; reporting SUBSCRIBED as
        // a data mutation caused an unnecessary extra refresh on each SSE connect.
        // Only actual PostgreSQL changes should invalidate queries.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') write('chat', { kind: 'disconnected' });
      });
      controller.enqueue(encoder.encode(': connected\n\n'));
      heartbeat = setInterval(() => { if (!closed) {
        try { controller.enqueue(encoder.encode(': keepalive\n\n')); } catch { /* closed */ }
      } }, 20_000);
      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        void realtime.removeChannel(channel);
        try { controller.close(); } catch { /* already closed */ }
      };
      req.signal.addEventListener('abort', close, { once: true });
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      void realtime.removeAllChannels();
    },
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
