import Link from 'next/link';
import { ArrowUpRight, Mail, Phone } from 'lucide-react';

type PublicContact = { contactEmail?: string | null; contactPhone?: string | null };

export default function Footer({ label = 'PUBLIC', contact }: { label?: string; contact?: PublicContact | null }) {
  if (label !== 'PUBLIC') {
    // Keep the staff/client portal footer unchanged.
    return <div className="page-wrap"><footer className="footer"><span>DM EVENTS • EVENT BOOKING & MANAGEMENT • {label}</span><Link href="/privacy" style={{color:'inherit'}}>Privacy Policy</Link></footer></div>;
  }
  const email = contact?.contactEmail?.trim();
  const phone = contact?.contactPhone?.trim();
  const dial = phone?.replace(/[^+\d]/g, '');
  return <footer className="dm-public-footer"><div className="dm-marketing__container">
    <div className="dm-public-footer__top"><div><Link href="/" className="dm-public-footer__brand">DM EVENTS <span>✳</span></Link><p>Thoughtfully planned celebrations, with all the important details in one place.</p></div><div className="dm-public-footer__links"><div><strong>Explore</strong><Link href="/">Home</Link><Link href="/packages">Packages</Link><Link href="/client/book">Request an event</Link></div><div><strong>Connect</strong>{email && <a href={`mailto:${email}`}><Mail size={14}/>{email}</a>}{phone && dial && <a href={`tel:${dial}`}><Phone size={14}/>{phone}</a>}{!email && !phone && <Link href="/client/book">Send an event inquiry <ArrowUpRight size={14}/></Link>}</div></div></div>
    <div className="dm-public-footer__bottom"><span>© {new Date().getFullYear()} DM Events · Event Booking & Management</span><Link href="/privacy">Privacy policy</Link></div>
  </div></footer>;
}
