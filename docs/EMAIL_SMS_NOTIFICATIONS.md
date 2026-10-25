# DM Events: booking email and SMS notifications

This patch preserves all current roles and booking flows. It adds **transactional operational alerts** for both online and walk-in clients. Client portals and access rules are not bypassed.

## What automatically generates a notification?

| Event | Email | SMS | Trigger |
|---|---|---|---|
| New online inquiry | Yes | Yes | Client submits event request |
| New walk-in inquiry | If email supplied | Yes | Authorized staff submits walk-in request |
| Booking status changes: Tentative / Held / Confirmed / Cancelled | If email supplied | Yes | Authorized staff saves a *different* status |
| Coordination details revised | If email supplied | Yes | Staff changes review note or agreed value while keeping status |
| Client requests cancellation | Yes | Yes | Client requests review of cancellation |
| Coordinator replies to an online client | Yes | Yes | Coordinator posts a message to an online client |

A message to a walk-in client cannot be generated from the website messaging API because they have **no authenticated client conversation**. Walk-ins still receive booking and status notifications through their recorded contact details. SMS messages intentionally do **not** contain private message content or personal event notes.

## Architecture

```
Next.js booking API transaction
  ├─ insert/update bookings + booking_history/messages
  └─ insert EMAIL/SMS notifications into notification_outbox (same PostgreSQL transaction)
          ↓
  Delivery worker (immediate attempt + scheduled retries)
          ├─ EMAIL -> HMAC-authenticated Python HTTP service -> Gmail SMTP (SSL/TLS) -> client inbox
          └─ SMS   -> httpSMS HTTP API -> connected Android phone/SIM -> carrier -> client
```

Next.js holds the contact data, database and httpSMS API key. Python holds the Gmail address and Google **app password**, and renders escaping-safe responsive HTML plus text/plain. The HMAC secret is shared between the apps.

To limit abuse of the free gateways, online users may create at most 5 booking requests per 15 minutes, authorized staff may create at most 30 walk-ins per 15 minutes, and Coordinators may send at most 30 messages per 15 minutes (using the existing database-backed rate limiter).

Outbox states: `PENDING` / `PROCESSING` / `RETRY` / `ACCEPTED` / `FAILED`. `ACCEPTED` means the gateway acknowledged the submission; **it does not guarantee inbox delivery or that the SMS was delivered to the device**. httpSMS can report later sent/delivered callbacks; webhook status reconciliation is not included in this patch.

**Idempotency and retries:** every event/channel has a unique `event_key`; database inserts are atomic with the action. Workers use PostgreSQL `FOR UPDATE SKIP LOCKED`, a two-minute lease and exponential backoff, up to 6 attempts. The SMS `request_id` is the stable notification UUID. A rare duplicate is still possible if an external provider accepts a message immediately before a server crash and that acceptance is not recorded. Gmail SMTP does not provide exactly-once delivery.

## 1. Apply database migration

Back up the database first. In the Next.js root:

```sh
npm install
npm run db:migrate
npm run typecheck
npm run build
```

`drizzle/0003_booking_notifications.sql` adds only `notification_outbox` and its indexes, checks, foreign key, and RLS. It does not alter existing bookings, messages or user roles. Do **not** run `db:push` or reset the database on production.

## 2. Create Gmail sending credentials

1. Create or choose a dedicated Google email address for DM Events (e.g. a Gmail account belonging to the business).
2. Enable **2-Step Verification** in Google Account settings.
3. Where supported, create a **Google App Password**, a 16-character secret for the SMTP connection. This is not your usual Google login password. Some Google-managed accounts do not allow app passwords.
4. Copy `python-mail/.env.example` to `python-mail/.env` and configure:

```dotenv
GMAIL_ADDRESS=your.business@gmail.com
GMAIL_APP_PASSWORD=your-google-app-password
GMAIL_SENDER_NAME="DM Events"
PYTHON_MAIL_SECRET=a-matching-secret-at-least-32-characters-long
PYTHON_MAIL_HOST=127.0.0.1
PYTHON_MAIL_PORT=8765
```

Generate a suitable shared secret using `openssl rand -hex 32`. Keep `.env` private. Do not publish Gmail App Passwords or this service's port on the internet. Gmail account limits/anti-spam restrictions apply, even though using SMTP does not require a paid sending API.

The Python service uses **only the standard library**, and produces HTML cards with the DM Events navy/blue palette and a plain-text alternative. User-supplied names and text are HTML-escaped. Gmail SMTP: `smtp.gmail.com:465` with SSL.

Start it from the project root on Linux:

```sh
set -a
source python-mail/.env
set +a
python3 python-mail/server.py
```

For Docker/private deployment, `python-mail/Dockerfile` is provided. If Next.js and Python run in separate hosts, use a **private HTTPS endpoint with network restrictions** and set `PYTHON_MAIL_URL` to that endpoint. `127.0.0.1` in a deployed Next.js server is *not* your home computer. Never expose this email service to the public internet without a private reverse proxy and TLS. Each request is signed with HMAC-SHA256 and a five-minute timestamp window.

## 3. Configure Next.js `.env`

```dotenv
APP_URL=http://localhost:3000
PYTHON_MAIL_URL=http://127.0.0.1:8765
PYTHON_MAIL_SECRET=a-matching-secret-at-least-32-characters-long

HTTPSMS_API_KEY=your-httpsms-account-api-key
HTTPSMS_FROM=+639123456789

NOTIFICATIONS_CRON_SECRET=another-long-random-secret-at-least-32-characters-long
```

Important: `PYTHON_MAIL_SECRET` must match between Python and Next.js. Keep all keys server-side. Authentication email verification and password recovery now use the Python Gmail service instead of Resend. If `EMAIL_VERIFICATION_REQUIRED=true`, make sure the Python service works *before* enabling public registrations.

Restart both services after editing credentials. The Next.js environment and the Python environment are separate.

## 4. Install and connect httpSMS

1. Register at <https://httpsms.com/> and obtain your **account** API key at <https://httpsms.com/settings>. Do not use a phone-only API key for the public gateway endpoint.
2. Install the httpSMS Android app on the phone with the SIM that will send the texts. Log into the service, grant the required SMS permissions and keep the phone connected, on and available.
3. Set `HTTPSMS_FROM` to the international number of that phone/SIM, like `+639123456789`.
4. Add `HTTPSMS_API_KEY` and `HTTPSMS_FROM` to the Next.js `.env`.

httpSMS `POST https://api.httpsms.com/v1/messages/send` uses the `x-api-key` header and JSON fields `from`, `to`, `content`, `request_id`. SMS recipients are E.164 formatted (e.g. **09123456789 → +639123456789** for Philippine numbers).

The httpSMS Free tier currently advertises **up to 200 SMS/month**. The SIM/phone, carrier SMS charges, roaming fees, and any carrier rate limits still apply. The Android phone is essential; httpSMS is not an SMS carrier.

## 5. Phone fields and validation

- Registration already uses `libphonenumber-js/max` to list every supported country and dial code.
- Online Booking, Walk-in Booking and Profile now use the same shared country-code selector component.
- Next.js validates the numbers on submission, and stores E.164 strings in PostgreSQL.
- The delivery gateway normalizes legacy local PH numbers as a fallback, but new entries always choose a country explicitly.
- The backend will reject invalid numbers; it will **not** guess a foreign country for an arbitrary local number.

## 6. Reliable scheduled delivery

New events try immediate delivery. You **must also run a scheduler** for retries and delivery if the provider is temporarily unavailable, or the application process restarts.

For a local/hosted cron, call the authenticated endpoint every minute (adapt cadence to hosting plan):

```sh
curl --fail -sS \
  -H "Authorization: Bearer $NOTIFICATIONS_CRON_SECRET" \
  https://your-dm-events-domain.com/api/cron/notifications
```

Protect the secret and use HTTPS when calling a deployed endpoint. If a platform uses scheduled GET jobs, configure the same Bearer header with the job. Do not expose the endpoint without a 32+ character secret.

Admin/staff with `settings.manage` permission can view masked recipients, event type, channel, attempt count and gateway acknowledgment/retry state at:

`/admin/maintenance/notifications`

The menu entry is under **Settings → Website & Administration → Email & SMS Notifications**, with server-side authorization. Only `FAILED` or `RETRY` jobs can be manually queued for retry.

## 7. End-to-end test checklist

- [ ] Set valid Gmail App Password and ensure Python starts.
- [ ] Verify Python tests: `python3 -m unittest discover -s python-mail/tests -v`.
- [ ] Enter `09123456789` with country `Philippines (+63)`; the booking API should save `+639123456789`.
- [ ] Send one test booking to your OWN inbox/phone; confirm the HTML email and SMS.
- [ ] Create a walk-in booking with only a phone: only SMS should be queued.
- [ ] Change Tentative → Held → Confirmed with an agreed value: one email/SMS per change.
- [ ] Post a Coordinator reply in an online client's conversation: client is notified without message text in SMS.
- [ ] Request cancellation: both contacts get notice, booking status remains unchanged until staff reviews.
- [ ] Temporarily disable the gateway: booking should save, notification should appear in RETRY, cron should retry it.
- [ ] Attempt `/api/notifications` and its POST as a Client: expect 403.
- [ ] Confirm `ACCEPTED` status does not claim carrier delivery.

Test with consented, real test numbers only. Review and publish the Privacy Policy from Admin → Website Content to disclose that client contact details and booking status are processed using Google/Gmail and httpSMS, including retention and contact information. Never use this operational channel for marketing without separate authorization.

## Troubleshooting

- **Python SMTP 503**: Check 2-Step Verification / App Password and outgoing `smtp.gmail.com:465` access. Google may restrict apps on managed accounts.
- **Python 401**: Wrong shared `PYTHON_MAIL_SECRET`, clock skew, or signature mismatch.
- **httpSMS 401**: Invalid account API key. **httpSMS 422**: Invalid sender/recipient or payload.
- **SMS not delivered despite ACCEPTED**: Check Android app, SIM, SMS permission, mobile signal, balance/carrier and httpSMS dashboard.
- **Production Next.js cannot reach Python**: `127.0.0.1` is local *to Next.js*, not to a separate server. Set `PYTHON_MAIL_URL` to the Python service's private address accessible by Next.js.
- **No retry**: Schedule periodic GET to `/api/cron/notifications` with Bearer secret. Immediate attempts alone are not durable background work.

There is **no live cloud integration or recipient delivery test** performed in the generated ZIP; a real production build and successful gateway tests require your Gmail, httpSMS, Supabase credentials and connected Android device.
