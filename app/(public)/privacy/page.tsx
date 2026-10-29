export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ShieldCheck, ArrowLeft, LockKeyhole, Info } from 'lucide-react';
import { currentSite } from '@/models/read';

export default async function Privacy() {
  const site = await currentSite();
  return <main className="page-wrap page-space workspace">
    <section className="workspace-hero"><div className="workspace-hero__top"><div><span className="workspace-kicker"><ShieldCheck size={14}/> TRUST & PRIVACY</span><h1>Privacy policy</h1><p>How DM Events describes the handling of the information you share through event inquiries, bookings, and account communication.</p></div><div className="workspace-hero__actions"><Link href="/" className="btn btn-outline"><ArrowLeft size={16}/> Back to homepage</Link></div></div></section>
    <div className="workspace-grid workspace-section"><article className="workspace-card"><div className="workspace-section__heading"><div><h2>Information & event requests</h2><p>The following policy is maintained by DM Events through Website Content Management.</p></div><LockKeyhole size={21} className="text-[#0b4d98]"/></div><div className="whitespace-pre-wrap break-words text-[13px] leading-8 text-[#38536c]">{site?.privacyPolicy || 'The privacy policy is not available at this time. Please contact DM Events for details about your information.'}</div></article>
      <aside className="workspace-stack"><div className="workspace-card"><h3>Your information matters</h3><p className="workspace-muted">Before sharing personal details, review how your information is used and contact the DM Events team if you have questions.</p><Link href="/packages" className="workspace-action mt-5"><span className="flex-1"><strong>Explore event packages</strong><small>Browse public event offerings</small></span><span className="workspace-action__arrow" aria-hidden="true">→</span></Link></div><div className="workspace-banner workspace-banner--warning"><Info size={18} className="shrink-0"/><span>DM Events must review and approve the published privacy policy and retention terms before collecting real customer information.</span></div></aside>
    </div>
  </main>;
}
