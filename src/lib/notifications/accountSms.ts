import { HttpError } from '@/lib/http';
/** OTP delivery through the SAME httpSMS Android gateway used for booking notifications. */
export async function sendAccountSms(to: string, content: string, requestId: string): Promise<void> {
  const key = process.env.HTTPSMS_API_KEY;
  const from = process.env.HTTPSMS_FROM;
  if (!key || !from || !/^\+[1-9]\d{6,14}$/.test(from))
    throw new HttpError(503, 'SMS verification is temporarily unavailable.');
  let response: Response;
  try {
    response = await fetch('https://api.httpsms.com/v1/messages/send', {
      method: 'POST', headers: { 'x-api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ from, to, content, request_id: requestId }),
      cache: 'no-store', signal: AbortSignal.timeout(12_000),
    });
  } catch { throw new HttpError(503, 'SMS gateway could not be reached. Please resend your code.'); }
  if (!response.ok) throw new HttpError(503, 'SMS provider rejected the verification message. Please try again.');
  const ack: unknown = await response.json().catch(() => null);
  if (!ack || typeof ack !== 'object' || (ack as {status?:unknown}).status !== 'success')
    throw new HttpError(503, 'SMS provider did not accept the message. Please retry.');
}
