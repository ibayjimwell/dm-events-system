import { requireActor } from '@/lib/auth';
import { can } from '@/lib/access';
import { HttpError, ok, route } from '@/lib/http';
import { sql } from '@/db';
import { realtimeServer } from '@/connection/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const REQUIRED_TABLES = [
  'bookings', 'booking_history', 'messages', 'message_reads', 'message_typing',
  'message_thread_preferences', 'message_thread_deletions', 'packages', 'site_content',
] as const;

function projectReferencesMatch(): boolean | null {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const databaseUrl = process.env.DATABASE_URL;
    if (!supabaseUrl || !databaseUrl) return null;
    const supabaseHost = new URL(supabaseUrl).hostname;
    const db = new URL(databaseUrl);
    const ref = supabaseHost.endsWith('.supabase.co') ? supabaseHost.split('.')[0] : null;
    // Both direct db.<ref>.supabase.co and pooled postgres.<ref> connections.
    const dbRef = db.hostname.startsWith('db.') && db.hostname.endsWith('.supabase.co')
      ? db.hostname.split('.')[1]
      : db.username.startsWith('postgres.') ? db.username.slice('postgres.'.length) : null;
    return ref && dbRef ? ref === dbRef : null;
  } catch { return null; }
}

type ProbeResult = { state: 'SUBSCRIBED' | 'TIMED_OUT' | 'CHANNEL_ERROR' | 'CLOSED' | 'ERROR'; detail?: string };

/** Verifies the Supabase channel join, without modifying data or exposing credentials. */
async function probeChannel(): Promise<ProbeResult> {
  const client = realtimeServer();
  const channel = client.channel(`dm-chat-health-${crypto.randomUUID()}`);
  channel.on('postgres_changes', { schema: 'public', table: 'messages', event: 'INSERT' }, () => {});
  try {
    return await new Promise<ProbeResult>(resolve => {
      let settled = false;
      const done = (state: ProbeResult['state'], detail?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ state, ...(detail ? { detail } : {}) });
      };
      const timer = setTimeout(() => done('TIMED_OUT'), 8_000);
      try {
        channel.subscribe((status, err) => {
          if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            done(status, err ? 'Realtime rejected the channel; check server logs' : undefined);
          }
        });
      } catch {
        done('ERROR', 'Could not initiate Realtime subscription');
      }
    });
  } finally {
    await client.removeChannel(channel);
    client.realtime.disconnect();
  }
}

/** Only administrators with the settings permission can run this diagnostic. */
export const GET = route(async req => {
  const user = await requireActor();
  if (user.role !== 'ADMIN' || !(await can(user, 'settings.manage'))) {
    throw new HttpError(403, 'Settings management permission required');
  }
  const credentialsConfigured = !!(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
    && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const rows = await sql<{ tablename: string }[]>`
    SELECT tablename FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
  `;
  const published = new Set(rows.map(row => row.tablename));
  const missingTables = REQUIRED_TABLES.filter(table => !published.has(table));
  const checkConnection = new URL(req.url).searchParams.get('probe') === '1';
  let probe: ProbeResult | null = null;
  if (checkConnection && credentialsConfigured) {
    try { probe = await probeChannel(); }
    catch { probe = { state: 'ERROR', detail: 'Realtime connection could not be established; check server logs' }; }
  }
  return ok({
    credentialsConfigured,
    projectReferencesMatch: projectReferencesMatch(),
    publicationReady: missingTables.length === 0,
    publishedTables: REQUIRED_TABLES.filter(table => published.has(table)),
    missingTables,
    probe,
    note: 'SUBSCRIBED confirms the WebSocket channel joined, not that a test message was delivered. Check a live two-user conversation.',
  });
});
