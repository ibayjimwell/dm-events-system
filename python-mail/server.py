#!/usr/bin/env python3
"""Authenticated stdlib-only HTML email service for DM Events (Gmail SMTP).
Run behind a private network/reverse proxy. Never expose port 8765 publicly.
"""
import hashlib
import hmac
import html
import json
import os
import re
import smtplib
import ssl
import time
from email.message import EmailMessage
from email.utils import formataddr, parseaddr
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

MAX_REQUEST_BYTES = 24000
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

def clean(value, limit=500):
    return html.escape(str(value if value is not None else '')[:limit], quote=True)

def build_email(template, data):
    """Render escaped data only; never accept raw user-authored HTML."""
    if template not in ('booking', 'generic'):
        raise ValueError('Unsupported email template')
    if not isinstance(data, dict):
        raise ValueError('Invalid template data')
    if template == 'booking':
        name = clean(data.get('name'), 180)
        heading = clean(data.get('heading'), 180)
        summary = clean(data.get('summary'), 800)
        reference = clean(data.get('reference'), 64)
        status = clean(data.get('status'), 24)
        event_type = clean(data.get('event_type'), 120)
        event_date = clean(data.get('event_date'), 80)
        url_raw = str(data.get('booking_url') or '')[:1000]
        url = urlparse(url_raw)
        safe_link = url_raw if url.scheme == 'https' or (url.scheme == 'http' and url.hostname in ('localhost', '127.0.0.1')) else ''
        link = (f'<a href="{clean(safe_link, 1000)}" style="display:inline-block;background:#0b4d98;color:#fff;'
                'padding:13px 25px;text-decoration:none;border-radius:6px;font-weight:700">View your booking</a>') if safe_link else ''
        status_word = str(data.get('status') or '').upper()
        footer_note = ('Your event is confirmed by DM Events. Contact the coordinator if you have questions.'
                       if status_word == 'CONFIRMED' else
                       'Your booking has been cancelled. Contact DM Events if you have questions.'
                       if status_word == 'CANCELLED' else
                       'A submitted request is not confirmed until DM Events completes its approval.')
        inner = f'''<p style="color:#6c7f91;font-size:14px">HELLO, {name}</p>
          <h1 style="font-size:28px;line-height:1.25;color:#071f3b;margin:10px 0 16px">{heading}</h1>
          <p style="font-size:15px;color:#37526c;line-height:1.8">{summary}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f6fa;border-radius:9px;margin:25px 0;padding:19px">
            <tr><td style="padding:8px 14px;color:#738496">Reference</td><td style="padding:8px 14px;font-weight:700">{reference}</td></tr>
            <tr><td style="padding:8px 14px;color:#738496">Event</td><td style="padding:8px 14px">{event_type}</td></tr>
            <tr><td style="padding:8px 14px;color:#738496">Preferred date</td><td style="padding:8px 14px">{event_date}</td></tr>
            <tr><td style="padding:8px 14px;color:#738496">Status</td><td style="padding:8px 14px;font-weight:700">{status}</td></tr>
          </table>
          {link}
          <p style="font-size:13px;color:#6c7f91;margin-top:22px">{clean(footer_note)} You can contact us if you need clarification.</p>'''
        plain = f"DM Events\n\nHello {str(data.get('name') or '')[:180]},\n{str(data.get('heading') or '')[:180]}\n{str(data.get('summary') or '')[:800]}\nReference: {str(data.get('reference') or '')[:64]}\nEvent: {str(data.get('event_type') or '')[:120]}\nPreferred date: {str(data.get('event_date') or '')[:80]}\nStatus: {str(data.get('status') or '')[:24]}\n{safe_link}"
    else:
        heading = clean(data.get('heading', 'DM Events account'), 180)
        body = str(data.get('text') or '')[:5000]
        safe_body = clean(body, 5000)
        # Make verified https/http links clickable without accepting arbitrary HTML.
        safe_body = re.sub(r'https?://[^\s&lt;&gt;"\']+',
                           lambda match: f'<a href="{match.group(0)}" style="color:#0b4d98">{match.group(0)}</a>',
                           safe_body)
        inner = (f'<h1 style="font-size:26px;color:#071f3b">{heading}</h1>'
                 f'<p style="font-size:15px;white-space:pre-wrap;line-height:1.8;color:#37526c">{safe_body}</p>')
        plain = body
    markup = f'''<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>DM Events</title></head>
      <body style="margin:0;padding:0;background:#eef3f8;font-family:Arial,Helvetica,sans-serif;color:#122c44">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#eef3f8;padding:28px 12px"><tr><td align="center">
          <table role="presentation" width="100%" style="max-width:610px;background:#fff;border:1px solid #dae4ed;border-radius:12px;overflow:hidden">
            <tr><td style="background:#071f3b;color:#fff;padding:27px 34px;font-size:24px;font-weight:700;letter-spacing:1px">DM EVENTS</td></tr>
            <tr><td style="padding:30px 34px">{inner}</td></tr>
            <tr><td style="background:#f1f6fa;padding:20px 34px;color:#708296;font-size:12px;line-height:1.6">DM Events · Event Booking &amp; Management<br/>This is an operational notification about your account or event inquiry. Please do not share your account credentials.</td></tr>
          </table>
        </td></tr></table>
      </body></html>'''
    return plain, markup


def verify_signature(raw, timestamp, signature, secret, now=None):
    if not secret or len(secret) < 32 or not timestamp.isdigit() or not re.fullmatch(r'[0-9a-f]{64}', signature):
        return False
    now = int(time.time()) if now is None else now
    if abs(now - int(timestamp)) > 300:
        return False
    digest = hmac.new(secret.encode(), timestamp.encode() + b'.' + raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, signature)


def send_message(payload):
    user = os.environ.get('GMAIL_ADDRESS', '').strip()
    password = os.environ.get('GMAIL_APP_PASSWORD', '').replace(' ', '')
    if not user or not password:
        raise RuntimeError('Gmail SMTP credentials are not configured')
    recipient = str(payload.get('to') or '').strip()
    subject = str(payload.get('subject') or '')[:180]
    if not EMAIL_PATTERN.fullmatch(recipient) or '\r' in recipient or '\n' in recipient:
        raise ValueError('Invalid recipient')
    if not subject or any(char in subject for char in '\r\n'):
        raise ValueError('Invalid subject')
    text, markup = build_email(payload.get('template'), payload.get('data'))
    message = EmailMessage()
    message['Subject'] = subject
    message['From'] = formataddr((os.environ.get('GMAIL_SENDER_NAME', 'DM Events'), user))
    message['To'] = recipient
    message.set_content(text)
    message.add_alternative(markup, subtype='html')
    context = ssl.create_default_context()
    with smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=15, context=context) as smtp:
        smtp.login(user, password)
        smtp.send_message(message)

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/send':
            self.respond(404, {'error': 'Not found'})
            return
        count = self.headers.get('content-length')
        if not count or not count.isdigit() or int(count) > MAX_REQUEST_BYTES:
            self.respond(413, {'error': 'Request too large'})
            return
        raw = self.rfile.read(int(count))
        if not verify_signature(raw, self.headers.get('X-DM-Timestamp', ''), self.headers.get('X-DM-Signature', ''), os.environ.get('PYTHON_MAIL_SECRET', '')):
            self.respond(401, {'error': 'Unauthorized'})
            return
        try:
            payload = json.loads(raw)
            if not isinstance(payload, dict):
                raise ValueError('Invalid request')
            send_message(payload)
        except (ValueError, TypeError) as exc:
            self.respond(400, {'error': str(exc)[:100]})
            return
        except (smtplib.SMTPException, OSError, RuntimeError):
            self.respond(503, {'error': 'Email gateway unavailable'})
            return
        self.respond(200, {'status': 'accepted'})

    def respond(self, code, body):
        raw = json.dumps(body).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, format_string, *args):
        # Keep client email addresses, password reset URLs and secrets out of access logs.
        pass

if __name__ == '__main__':
    secret = os.environ.get('PYTHON_MAIL_SECRET', '')
    if len(secret) < 32:
        raise SystemExit('PYTHON_MAIL_SECRET must be at least 32 characters')
    host = os.environ.get('PYTHON_MAIL_HOST', '127.0.0.1')
    port = int(os.environ.get('PYTHON_MAIL_PORT', '8765'))
    print(f'DM Events Python email service listening on {host}:{port}', flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()
