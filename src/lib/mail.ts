import { HttpError } from '@/lib/http';
import { postToPython } from '@/lib/notifications/providers';

/** Auth verification/reset emails are also sent as escaped HTML through Python Gmail SMTP. */
export async function sendMail(to: string, subject: string, body: string) {
  const url = process.env.PYTHON_MAIL_URL;
  const secret = process.env.PYTHON_MAIL_SECRET;
  if (!url || !secret || secret.length < 32) throw new HttpError(503, 'Email service is not configured.');
  try {
    await postToPython(url, secret, JSON.stringify({
      to, subject, template: 'generic', data: { heading: subject, text: body },
    }));
  } catch {
    throw new HttpError(503, 'Email service unavailable. Please try again later.');
  }
}
