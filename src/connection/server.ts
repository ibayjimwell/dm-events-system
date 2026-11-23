import { createClient } from '@supabase/supabase-js';

/**
 * Each authenticated HTTP event stream owns its own Supabase channel/client.
 * The service-role key must NEVER be included in a browser bundle or SSE payload.
 * DM Events' login is session-cookie based, not Supabase Auth.
 */
export function realtimeServer() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase Realtime credentials are not configured');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 30 } },
  });
}
