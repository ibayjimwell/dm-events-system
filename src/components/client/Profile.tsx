'use client';

import { useState, type FormEvent } from 'react';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { UserRound, Mail, Phone, ShieldCheck, Pencil, ArrowLeft, CheckCircle2, AlertCircle, CalendarCheck } from 'lucide-react';
import Link from 'next/link';
import { api, json } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { DetailSkeleton } from '@/components/ui/LoadingSkeleton';
import CountryPhoneInput from '@/components/ui/CountryPhoneInput';
import { normalizePhoneNumber, type PhoneCountry } from '@/lib/validators';

type User = { fullName: string; email: string; phone: string | null; role: string };

export default function Profile() {
  const { data, refresh, loading, error } = useLiveQuery(() => api<{ user: User }>('/api/auth/me'), [],{cacheKey:'client:/api/auth/me',realtimeKinds:['users']});
  const user = data?.user;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<PhoneCountry>('PH');
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState(false);
  const [busy, setBusy] = useState(false);

  const startEditing = () => {
    if (!user) return;
    const parsed = user.phone ? parsePhoneNumberFromString(user.phone) : undefined;
    setName(user.fullName);
    setCountry(parsed?.country ?? 'PH');
    setPhone(parsed?.formatNational() ?? user.phone ?? '');
    setMessage('');
    setEditing(true);
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) { setMessageError(true); setMessage('Please enter your full name.'); return; }
    const normalized = phone.trim() ? normalizePhoneNumber(phone, country) : '';
    if (phone.trim() && !normalized) { setMessageError(true); setMessage('Please enter a valid phone number for the selected country.'); return; }
    setBusy(true);
    setMessage('');
    try {
      await api('/api/profile', json('PATCH', { fullName: name.trim(), phone: normalized }));
      await refresh();
      setEditing(false);
      setMessageError(false);
      setMessage('Your contact information has been saved.');
    } catch (cause) {
      setMessageError(true);
      setMessage(cause instanceof Error ? cause.message : 'Unable to save your profile.');
    } finally { setBusy(false); }
  }

  const initials = (user?.fullName || 'DM').split(/\s+/).filter(Boolean).slice(0,2).map(part => part[0]?.toUpperCase()).join('');

  return <main className="page-wrap page-space workspace">
    <section className="workspace-hero">
      <div className="workspace-hero__top"><div><span className="workspace-kicker"><UserRound size={14}/> Your account</span>
        <h1>Personal information</h1><p>Keep your contact details accurate so our team can coordinate your upcoming events with you.</p>
      </div><div className="workspace-hero__actions"><Link className="btn btn-outline" href="/client/bookings"><ArrowLeft size={15}/> My bookings</Link></div></div>
    </section>
    {error && <p role="alert" className="workspace-banner workspace-banner--error workspace-section"><AlertCircle size={17}/>{error}</p>}
    {loading && !data ? <div className="workspace-section"><DetailSkeleton label="Loading your account information" /></div> : user &&
      <div className="workspace-grid workspace-section">
        <section className="workspace-card workspace-reveal" aria-label="Account details">
          <div className="flex flex-wrap items-center gap-4"><div className="workspace-profile-avatar" aria-hidden="true">{initials}</div>
            <div className="flex-1"><div className="workspace-kicker" style={{color:'#366b91'}}>CLIENT ACCOUNT</div><h2 className="mt-2 !font-sans !text-2xl !font-bold !leading-snug">{user.fullName}</h2><p className="workspace-muted">Your private DM Events profile</p></div>
            {!editing && <button type="button" className="btn btn-ghost btn-small" onClick={startEditing}><Pencil size={15}/> Edit information</button>}
          </div>
          <hr className="workspace-divider" />
          {editing ? <form className="grid gap-5" onSubmit={submit}>
              <div className="field"><label htmlFor="profile-fullname">Full name</label><input id="profile-fullname" autoComplete="name" required minLength={2} maxLength={180} value={name} onChange={event => setName(event.target.value)} /></div>
              <CountryPhoneInput id="profile-phone" label="Contact number" required={false} country={country} number={phone} onCountryChange={setCountry} onNumberChange={setPhone} />
              <p className="workspace-muted">Your email address is associated with your login and cannot be changed here.</p>
              <div className="flex flex-wrap gap-3"><button className="btn" type="submit" disabled={busy}><CheckCircle2 size={16}/>{busy ? 'Saving…' : 'Save changes'}</button><button className="btn btn-ghost" type="button" disabled={busy} onClick={() => {setEditing(false);setMessage('');}}>Cancel</button></div>
            </form> : <dl className="grid gap-5 sm:grid-cols-2">
              <div className="workspace-kv"><dt><UserRound size={13} className="inline mr-1"/> Full name</dt><dd>{user.fullName}</dd></div>
              <div className="workspace-kv"><dt><Mail size={13} className="inline mr-1"/> Email address</dt><dd>{user.email}</dd></div>
              <div className="workspace-kv"><dt><Phone size={13} className="inline mr-1"/> Contact number</dt><dd>{user.phone || 'Not provided yet'}</dd></div>
              <div className="workspace-kv"><dt><ShieldCheck size={13} className="inline mr-1"/> Account access</dt><dd><span className="workspace-pill">{user.role}</span></dd></div>
            </dl>}
          {message && <p role={messageError ? 'alert' : 'status'} className={`workspace-banner mt-5 ${messageError ? 'workspace-banner--error' : 'workspace-banner--success'}`}>{messageError ? <AlertCircle size={17}/> : <CheckCircle2 size={17}/>} {message}</p>}
        </section>
        <aside className="workspace-stack"><section className="workspace-card"><h3>Ready for your next event?</h3><p className="workspace-muted">Choose a package, review available dates, and send your request to the DM Events team.</p><Link href="/client/book" className="workspace-action mt-5"><span className="workspace-action__icon"><CalendarCheck size={20}/></span><span><strong>Plan an event</strong><small>Start a new request</small></span><span className="workspace-action__arrow" aria-hidden="true">→</span></Link></section>
          <div className="workspace-banner"><ShieldCheck size={17} className="shrink-0"/><span>Only your own account details appear here. Your booking information and messages are available in your Client portal.</span></div>
        </aside>
      </div>}
  </main>;
}
