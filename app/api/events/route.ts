import { realtimeEventStream } from '@/connection/bridge';

/** Lightweight HTTP adapter. All Supabase subscriptions live in src/connection. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(request: Request) {
  return realtimeEventStream(request);
}
