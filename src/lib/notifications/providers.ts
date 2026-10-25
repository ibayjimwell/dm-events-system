import { randomUUID, createHmac } from 'node:crypto';
import type { NotificationPayload } from './types';

export class DeliveryError extends Error {
  constructor(message: string, public retryable = true) { super(message); }
}

function displayDate(iso: string) {
  const date = new Date(`${iso}T12:00:00+08:00`);
  return Number.isNaN(date.valueOf()) ? iso : new Intl.DateTimeFormat('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila',
  }).format(date);
}

function messageContent(p: NotificationPayload) {
  switch (p.kind) {
    case 'BOOKING_CREATED':
      return { subject: `DM Events | Request received (${p.reference})`,
        heading: 'Your event request has been received',
        summary: 'Your request is Tentative and awaiting review by DM Events. Your event date is not yet confirmed.',
        sms: `DM Events: We received ${p.reference} for ${displayDate(p.eventDate)}. Status: Tentative (not confirmed). We will review your request.` };
    case 'BOOKING_STATUS_CHANGED':
      return { subject: `DM Events | ${p.reference} is now ${p.status.toLowerCase()}`,
        heading: `Booking status: ${p.status.toLowerCase()}`,
        summary: p.status === 'CONFIRMED'
          ? 'Your event booking has been confirmed by DM Events. Contact our coordinator for the latest arrangements.'
          : p.status === 'CANCELLED'
            ? 'Your booking is recorded as cancelled. Please contact DM Events if you have questions.'
            : p.status === 'HELD'
              ? 'Your requested date has been placed on hold during review. This is not yet a confirmed booking.'
              : 'Your request is Tentative and awaiting review. This is not yet a confirmed booking.',
        sms: `DM Events: ${p.reference} for ${displayDate(p.eventDate)} is now ${p.status}. ${p.status === 'CONFIRMED' ? 'Booking confirmed.' : 'Contact us for details.'}` };
    case 'BOOKING_DETAILS_UPDATED':
      return { subject: `DM Events | Details updated (${p.reference})`,
        heading: 'Your event details were updated',
        summary: p.source === 'WALK_IN'
          ? 'DM Events updated the coordination details for your walk-in event request. Please contact our team to review the latest information.'
          : 'DM Events updated the coordination details for your event. Sign in to review your booking and any new notes.',
        sms: p.source === 'WALK_IN'
          ? `DM Events: Coordination details for ${p.reference} were updated. Please contact DM Events for details.`
          : `DM Events: We updated the coordination details for ${p.reference}. Sign in to review the latest information.` };
    case 'CANCELLATION_REQUESTED':
      return { subject: `DM Events | Cancellation request received (${p.reference})`,
        heading: 'Cancellation request received',
        summary: 'We have recorded your cancellation request. Your current booking status remains unchanged until DM Events reviews it.',
        sms: `DM Events: Cancellation request for ${p.reference} received. Your booking is not cancelled until staff reviews it.` };
    case 'COORDINATOR_MESSAGE':
      return { subject: `DM Events | New message about ${p.reference}`,
        heading: 'A coordinator has sent an update',
        summary: 'You have a new message from DM Events. Sign in to your client account to read and respond securely.',
        sms: `DM Events: You have a new coordinator message about ${p.reference}. Sign in to your DM Events client account to read it.` };
  }
}

function bookingLink(p: NotificationPayload): string | undefined {
  if (p.source === 'WALK_IN') return undefined; // Walk-ins have no login and must never receive a private portal link.
  const base = process.env.APP_URL?.trim();
  if (!base) return undefined;
  try {
    const url = new URL(base);
    if (!['https:', 'http:'].includes(url.protocol)) return undefined;
    return new URL(`/client/bookings/${p.bookingId}`, url).toString();
  } catch { return undefined; }
}

/** Gmail SMTP is performed solely by the authenticated Python email service. */
export async function sendPythonEmail(recipient: string, payload: NotificationPayload): Promise<string> {
  const content = messageContent(payload);
  const url = process.env.PYTHON_MAIL_URL;
  const secret = process.env.PYTHON_MAIL_SECRET;
  if (!url || !secret || secret.length < 32) throw new DeliveryError('Python email service is not configured.', true);
  const body = JSON.stringify({
    to: recipient, subject: content.subject, template: 'booking',
    data: {
      name: payload.name, heading: content.heading, summary: content.summary,
      reference: payload.reference, status: payload.status,
      event_type: payload.eventType, event_date: displayDate(payload.eventDate),
      booking_url: bookingLink(payload) ?? '',
    },
  });
  return postToPython(url, secret, body);
}

/**
 * Resolve the Python Mail endpoint from any of these supported values:
 *   https://python-mail.example.com
 *   https://python-mail.example.com/api
 *   https://python-mail.example.com/api/send
 *   http://127.0.0.1:8765   (local standalone Python server)
 *   http://127.0.0.1:8765/send
 *
 * Vercel's Python Function is /api/send; the local Python HTTP server is /send.
 */
export function resolvePythonMailEndpoint(configuredUrl: string): string {
  const value = configuredUrl.trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DeliveryError(
      'PYTHON_MAIL_URL is invalid. Use a plain URL without Markdown brackets, such as https://your-mail.vercel.app/api.',
      false,
    );
  }

  const localhost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase());
  if ((url.protocol !== 'https:' && !(localhost && url.protocol === 'http:')) ||
      url.username || url.password || url.search || url.hash) {
    throw new DeliveryError(
      'PYTHON_MAIL_URL must be an HTTPS URL without credentials, query parameters or fragments (HTTP is allowed only for localhost).',
      false,
    );
  }

  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/') {
    url.pathname = localhost ? '/send' : '/api/send';
  } else if (path === '/api') {
    url.pathname = '/api/send';
  } else if (path === '/send' || path === '/api/send') {
    url.pathname = path;
  } else {
    throw new DeliveryError(
      'PYTHON_MAIL_URL must end in /api, /api/send, /send, or the domain root.',
      false,
    );
  }
  return url.toString();
}

/**
 * Calls Python Mail from the Next.js SERVER. This is not a browser request,
 * so browser CORS settings are neither required nor relevant.
 *
 * No recipient, message body, HMAC signature or secret is written to logs.
 */
export async function postToPython(url: string, secret: string, body: string): Promise<string> {
  if (!secret || secret.length < 32) {
    throw new DeliveryError('PYTHON_MAIL_SECRET is missing or too short (minimum 32 characters).', false);
  }

  const endpoint = resolvePythonMailEndpoint(url);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-DM-Timestamp': timestamp,
        'X-DM-Signature': signature,
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
      redirect: 'error',
    });
  } catch (error) {
    const timeout = error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError');
    const reason = timeout
      ? 'Python email request timed out.'
      : 'Unable to reach Python Mail. Check PYTHON_MAIL_URL, deployment status, and network access.';
    console.error(`[DM Events email] ${reason} Endpoint: ${endpoint}`);
    throw new DeliveryError(reason, true);
  }

  if (!response.ok) {
    let message: string;
    switch (response.status) {
      case 401:
        message = 'Python Mail rejected the signature (401). Ensure PYTHON_MAIL_SECRET is identical in BOTH Vercel projects.';
        break;
      case 403:
        message = 'Python Mail returned 403. Check Vercel Deployment Protection or access restrictions.';
        break;
      case 404:
        message = 'Python Mail returned 404. Check that /api/send is deployed and PYTHON_MAIL_URL points to the correct project.';
        break;
      case 405:
        message = 'Python Mail returned 405. The email gateway must accept POST requests.';
        break;
      case 503:
        message = 'Python Mail returned 503. Check GMAIL_ADDRESS and GMAIL_APP_PASSWORD in the Python Mail Vercel project and inspect its runtime logs.';
        break;
      default:
        message = `Python Mail returned HTTP ${response.status}. Check the Python Mail Vercel function logs.`;
    }
    console.error(`[DM Events email] ${message} Endpoint: ${endpoint}`);
    throw new DeliveryError(message, response.status === 429 || response.status === 408 || response.status >= 500);
  }

  // A successful gateway call must come from our Python mail endpoint, not a
  // login page, HTML fallback, or a Vercel protection/redirect page.
  const reply: unknown = await response.json().catch(() => null);
  if (!reply || typeof reply !== 'object' ||
      (reply as { status?: unknown }).status !== 'accepted') {
    console.error(`[DM Events email] Unexpected gateway response from ${endpoint}`);
    throw new DeliveryError('Python Mail did not confirm message acceptance. Check the configured endpoint.', false);
  }

  // This marker is not proof of delivery to the inbox.
  return randomUUID();
}

/** httpSMS uses an active Android device/SIM, not a free carrier-free SMS service. */
export async function sendHttpSms(recipient: string, payload: NotificationPayload, requestId: string): Promise<string> {
  const apiKey = process.env.HTTPSMS_API_KEY;
  const from = process.env.HTTPSMS_FROM;
  if (!apiKey || !from || !/^\+[1-9]\d{6,14}$/.test(from)) {
    throw new DeliveryError('httpSMS is not configured with a valid sender number.');
  }
  let response: Response;
  try {
    response = await fetch('https://api.httpsms.com/v1/messages/send', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: recipient, content: messageContent(payload).sms, request_id: requestId }),
      cache: 'no-store', signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new DeliveryError('httpSMS gateway connection failed.');
  }
  if (!response.ok) throw new DeliveryError(`httpSMS returned HTTP ${response.status}.`, response.status >= 500 || response.status === 429 || response.status === 408);
  const result: unknown = await response.json().catch(() => null);
  if (!result || typeof result !== 'object' || (result as { status?: string }).status !== 'success') {
    throw new DeliveryError('httpSMS did not acknowledge the message.');
  }
  const data = (result as { data?: { id?: string } }).data;
  return data?.id || requestId;
}
