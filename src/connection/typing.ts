/** Typing pulses use the existing same-origin, session-authenticated API.
 * No Supabase service key or anonymous write privileges are exposed to clients.
 */
export async function signalTyping(bookingId: string, typing: boolean): Promise<void> {
  try {
    await fetch('/api/messages/typing', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, typing }),
      cache: 'no-store',
    });
  } catch { /* Typing is ephemeral; never interrupt the message composer. */ }
}
