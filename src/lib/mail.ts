import { HttpError } from '@/lib/http';
import { DeliveryError, postToPython } from '@/lib/notifications/providers';

/** Verification/reset emails use Python Gmail; never expose the recipient or token in server logs. */
export async function sendMail(to: string, subject: string, body: string) {
  const url = process.env.PYTHON_MAIL_URL;
  const secret = process.env.PYTHON_MAIL_SECRET;
  if (!url || !secret || secret.length < 32) {
    throw new HttpError(503, 'Email service is not configured.');
  }
  try {
    await postToPython(url, secret, JSON.stringify({
      to,
      subject,
      template: 'generic',
      data: { heading: subject, text: body },
    }));
  } catch (error) {
    // Logs contain only a sanitized gateway diagnosis, not recipients or reset links.
    console.error('[DM Events account email]',
      error instanceof DeliveryError ? error.message : 'Unexpected email gateway error');
    throw new HttpError(503, 'Email service unavailable. Please try again later.');
  }
}
