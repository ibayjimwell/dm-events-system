import hashlib
import hmac
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import build_email, verify_signature, send_message

class MailTests(unittest.TestCase):
    def test_escaped_html(self):
        text, output = build_email('booking', {
            'name': '<script>alert(1)</script>', 'heading': 'Booking received',
            'summary': '<img src=x>', 'reference': 'DEM-2026-A', 'event_type': 'Wedding',
            'event_date': 'October 30, 2026', 'status': 'TENTATIVE', 'booking_url': 'javascript:alert(1)' })
        self.assertNotIn('<script>', output)
        self.assertNotIn('<img src=x>', output)
        self.assertNotIn('javascript:alert(1)', output)
        self.assertIn('&lt;script&gt;', output)
        self.assertIn('DEM-2026-A', text)

    def test_confirmed_email_has_no_tentative_disclaimer(self):
        _, markup = build_email('booking', {
            'name': 'Client', 'heading': 'Booking confirmed', 'summary': 'Confirmed.',
            'reference': 'DEM-X', 'event_type': 'Wedding', 'event_date': 'October 31, 2026',
            'status': 'CONFIRMED', 'booking_url': ''})
        self.assertIn('Your event is confirmed by DM Events', markup)
        self.assertNotIn('Your request is not confirmed', markup)

    def test_hmac_and_expiration(self):
        secret = 'a' * 48
        raw = b'{"template":"booking"}'
        timestamp = '1500'
        sig = hmac.new(secret.encode(), timestamp.encode()+b'.'+raw, hashlib.sha256).hexdigest()
        self.assertTrue(verify_signature(raw, timestamp, sig, secret, now=1500))
        self.assertFalse(verify_signature(raw, timestamp, sig, secret, now=2000))
        self.assertFalse(verify_signature(raw+b'1', timestamp, sig, secret, now=1500))

    def test_gmail_smtp_message_has_html_and_plaintext(self):
        payload = {'to': 'client@example.com', 'subject': 'Booking update', 'template': 'generic',
                   'data': {'heading': 'Booking', 'text': 'Updated.'}}
        with patch.dict('os.environ', {'GMAIL_ADDRESS': 'office@gmail.com', 'GMAIL_APP_PASSWORD': 'appsecret'}):
            with patch('server.smtplib.SMTP_SSL') as cls:
                send_message(payload)
                msg = cls.return_value.__enter__.return_value.send_message.call_args.args[0]
                self.assertTrue(msg.is_multipart())
                self.assertEqual(msg['To'], 'client@example.com')
                self.assertIn('text/html', str(msg))
                self.assertIn('text/plain', str(msg))

if __name__ == '__main__': unittest.main()
