import { route, ok, HttpError } from '@/lib/http';
import { requirePermission } from '@/lib/access';
import { checkAuthLimit, audit } from '@/lib/auth';
import { DeliveryError, postToPython } from '@/lib/notifications/providers';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Send a diagnostic email only to the authenticated staff member's own
 * account address. It never accepts a recipient supplied by the browser.
 */
export const POST = route(async () => {
  const user = await requirePermission('settings.manage');
  await checkAuthLimit(`notification-email-test:${user.id}`, 3);

  const serviceUrl = process.env.PYTHON_MAIL_URL;
  const secret = process.env.PYTHON_MAIL_SECRET;
  if (!serviceUrl || !secret || secret.length < 32) {
    throw new HttpError(503, 'PYTHON_MAIL_URL or PYTHON_MAIL_SECRET is not configured in the Next.js deployment.');
  }

  try {
    await postToPython(serviceUrl, secret, JSON.stringify({
      to: user.email,
      subject: 'DM Events | Email gateway test',
      template: 'generic',
      data: {
        heading: 'Your DM Events email gateway is connected',
        text: 'This test was requested from the DM Events administrator notification page. Gmail SMTP accepted this message. No booking status has changed.',
      },
    }));
  } catch (error) {
    if (error instanceof DeliveryError) {
      // Error strings are provider-generated and scrubbed of secret/recipient values.
      throw new HttpError(502, error.message);
    }
    throw new HttpError(502, 'Python email gateway test failed. Inspect both Vercel runtime logs.');
  }

  await audit(user.id, 'EMAIL_GATEWAY_TEST', 'user', user.id);
  return ok({
    accepted: true,
    message: 'Python Mail reports SMTP acceptance. Check your inbox and spam folder.',
  });
});
