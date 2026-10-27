'use client';
import { useState, type FormEvent } from 'react';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { api, json } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { DetailSkeleton } from '@/components/ui/LoadingSkeleton';
import { Panel, Field, PageTitle } from '@/components/ui/Blocks';
import CountryPhoneInput from '@/components/ui/CountryPhoneInput';
import { normalizePhoneNumber, type PhoneCountry } from '@/lib/validators';

type User = { fullName: string; email: string; phone: string | null; role: string };
export default function Profile() {
  const { data, refresh, loading, error } = useLiveQuery(() => api<{ user: User }>('/api/auth/me'), []);
  const u = data?.user;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<PhoneCountry>('PH');
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const startEditing = () => {
    if (!u) return;
    setName(u.fullName);
    const parsed = u.phone ? parsePhoneNumberFromString(u.phone) : undefined;
    setCountry(parsed?.country ?? 'PH');
    setPhone(parsed?.formatNational() ?? u.phone ?? '');
    setStatus('');
    setEditing(true);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = phone.trim() ? normalizePhoneNumber(phone, country) : '';
    if (phone.trim() && !normalized) { setStatus('Please enter a valid phone number for the chosen country.'); return; }
    setBusy(true);
    setStatus('');
    try {
      await api('/api/profile', json('PATCH', { fullName: name, phone: normalized }));
      setStatus('Profile updated.');
      setEditing(false);
      await refresh();
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Update failed.'); }
    finally { setBusy(false); }
  }

  return (
    <main className="page-wrap page-space min-w-0">
      <PageTitle title="My profile" subtitle="Manage your account contact information." />
      {error && <p role="alert" className="error">{error}</p>}{loading && !data ? <DetailSkeleton label="Loading profile" /> : <div className="max-w-2xl"><Panel title="Account details">
        {u && <div className="grid min-w-0 gap-5">
          {editing ? <form className="grid min-w-0 gap-5" onSubmit={submit}>
            <Field label="Full name"><input required value={name} onChange={(event) => setName(event.target.value)} /></Field>
            <CountryPhoneInput id="profile-phone" label="Contact number" required={false} country={country} number={phone} onCountryChange={setCountry} onNumberChange={setPhone} />
            <div className="flex flex-wrap gap-3"><button disabled={busy} className="btn">Save profile</button><button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button></div>
          </form> : <>
            <p className="break-words"><strong>Full name:</strong> {u.fullName}</p>
            <p className="break-words"><strong>Email:</strong> {u.email}</p>
            <p className="break-words"><strong>Contact number:</strong> {u.phone || 'Not provided'}</p>
            <p><strong>Account role:</strong> {u.role}</p>
            <button className="btn" onClick={startEditing}>Edit profile</button>
          </>}
          {status && <p role="status" className="notice break-words">{status}</p>}
        </div>}
      </Panel></div>}
    </main>
  );
}
