'use client';

import { type ChangeEvent, type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import {
  ArrowRight, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight,
  ClipboardCheck, Image as ImageIcon, MapPin, PartyPopper, ShieldCheck,
  Sparkles, UploadCloud, UserRound, UsersRound, Wallet, X,
} from 'lucide-react';
import { api, json } from '@/api-client/http';
import { assertAvailableDate } from '@/api-client/bookingAvailability';
import { uploadImage } from '@/api-client/uploadImage';
import AvailableDatePicker from '@/components/ui/AvailableDatePicker';
import CountryPhoneInput from '@/components/ui/CountryPhoneInput';
import { InlineSkeleton } from '@/components/ui/LoadingSkeleton';
import { normalizePhoneNumber, type PhoneCountry } from '@/lib/validators';
import styles from './BookingWizard.module.css';
import { BookingSuccessCard } from '@/components/ui/BookingFeedback';

type PublicPackage = {
  id: string;
  name: string;
  description: string;
  inclusions: string[];
  imageId: string | null;
};
type Values = {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  eventType: string;
  eventDate: string;
  guestCount: string;
  venue: string;
  estimatedBudget: string;
  packageId: string;
  preferredTheme: string;
  colorPalette: string;
  specialRequests: string;
  inspirationAssetId: string;
};
type ClientProfile = { fullName: string; email: string; phone: string | null; role: string };
type Step = 1 | 2 | 3 | 4 | 5;

const steps = [
  { title: 'Package', subtitle: 'Find your experience', icon: Sparkles },
  { title: 'Event date', subtitle: 'Check availability', icon: CalendarDays },
  { title: 'Event details', subtitle: 'Tell us your plans', icon: PartyPopper },
  { title: 'Your contact', subtitle: 'Verify your details', icon: UserRound },
  { title: 'Review', subtitle: 'Confirm your inquiry', icon: ClipboardCheck },
] as const;
const eventTypes = ['Wedding', 'Birthday', 'Debut', 'Corporate Event', 'Other'] as const;
const inputClass = styles.input;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const initialValues: Values = {
  contactName: '', contactEmail: '', contactPhone: '', eventType: 'Wedding', eventDate: '',
  guestCount: '', venue: '', estimatedBudget: '', packageId: '', preferredTheme: '',
  colorPalette: '', specialRequests: '', inspirationAssetId: '',
};
function readableDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'Not selected';
  const [year, month, day] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'full', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}
function todayInManila() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

export default function BookingWizard({ walkInRole }: { walkInRole?: 'ADMIN'|'COORDINATOR' } = {}) {
  const isWalkIn = !!walkInRole;
  const listBase = walkInRole === 'ADMIN' ? '/admin/bookings' : '/coordinator/requests';
  const [completed, setCompleted] = useState<{id:string;reference:string}|null>(null);
  const router = useRouter();
  const search = useSearchParams();
  const requestedPackageId = search.get('package') ?? '';
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<Values>(() => ({ ...initialValues, packageId: requestedPackageId }));
  const [customEventType, setCustomEventType] = useState('');
  const [packages, setPackages] = useState<PublicPackage[] | null>(null);
  const [packageError, setPackageError] = useState('');
  const [packageRefresh, setPackageRefresh] = useState(0);
  const [profileStatus, setProfileStatus] = useState<'loading' | 'ready' | 'error'>(walkInRole ? 'ready' : 'loading');
  const [country, setCountry] = useState<PhoneCountry>('PH');
  const [photoName, setPhotoName] = useState('');
  const [showStyling, setShowStyling] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState('');

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setForm(previous => ({ ...previous, [key]: value }));

  // The query is the source of truth for a package chosen on the public website.
  useEffect(() => {
    if (requestedPackageId) setForm(previous => ({ ...previous, packageId: requestedPackageId }));
  }, [requestedPackageId]);

  // Only published packages are selectable; do not silently substitute another package.
  useEffect(() => {
    const controller = new AbortController();
    setPackageError('');
    void api<{ packages: PublicPackage[] }>('/api/packages', { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return;
        setPackages(result.packages);
        if (requestedPackageId && !result.packages.some(pkg => pkg.id === requestedPackageId)) {
          setForm(previous => ({ ...previous, packageId: '' }));
          setPackageError('The requested package is no longer available. Please choose another package.');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPackages(null);
          setPackageError('Could not load published packages. Please retry.');
        }
      });
    return () => controller.abort();
  }, [packageRefresh, requestedPackageId]);

  // Populate the contact card from the authenticated account, not from URL params.
  useEffect(() => {
    if (isWalkIn) return; // Walk-in clients have no portal account; staff enters their details.
    const controller = new AbortController();
    void api<{ user: ClientProfile | null }>('/api/auth/me', { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return;
        const user = result.user;
        if (!user || user.role !== 'CLIENT') {
          setProfileStatus('error');
          return;
        }
        if (user.phone) {
          const parsed = parsePhoneNumberFromString(user.phone);
          if (parsed?.country) setCountry(parsed.country);
        }
        setForm(previous => ({
          ...previous,
          contactName: previous.contactName || user.fullName,
          contactEmail: previous.contactEmail || user.email,
          contactPhone: previous.contactPhone || user.phone || '',
        }));
        setProfileStatus('ready');
      })
      .catch(() => { if (!controller.signal.aborted) setProfileStatus('error'); });
    return () => controller.abort();
  }, [isWalkIn]);

  const selectedPackage = packages?.find(pkg => pkg.id === form.packageId);
  const eventType = form.eventType === 'Other' ? customEventType.trim() : form.eventType;
  const normalizedPhone = normalizePhoneNumber(form.contactPhone, country);

  function move(next: Step) {
    setStep(next);
    setError('');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const continueStep = useCallback(async () => {
    if (busy) return;
    setError('');
    if (step === 1) {
      if (!packages) { setError('Packages are still loading. Please retry.'); return; }
      if (form.packageId && !packages.some(pkg => pkg.id === form.packageId)) {
        setError('This package is no longer published. Choose an available package.'); return;
      }
      move(2);
      return;
    }
    if (step === 2) {
      if (!form.eventDate || form.eventDate < todayInManila()) {
        setError('Select today or a future available event date.'); return;
      }
      setBusy(true);
      try {
        await assertAvailableDate(form.eventDate);
        move(3);
      } catch (caught) {
        setForm(previous => ({ ...previous, eventDate: '' }));
        setError(caught instanceof Error ? caught.message : 'Could not verify availability.');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step === 3) {
      if (eventType.length < 2 || eventType.length > 120) {
        setError('Enter an event type between 2 and 120 characters.'); return;
      }
      if (!Number.isInteger(Number(form.guestCount)) || Number(form.guestCount) < 1 || Number(form.guestCount) > 100000) {
        setError('Enter an expected guest count between 1 and 100,000.'); return;
      }
      if (!form.estimatedBudget.trim()) { setError('Enter an estimated budget or budget range.'); return; }
      if (form.venue.length > 2000 || form.estimatedBudget.length > 200) {
        setError('Please shorten the venue or budget details.'); return;
      }
      move(4);
      return;
    }
    if (step === 4) {
      if (profileStatus === 'loading') { setError('Your account details are still loading.'); return; }
      if (form.contactName.trim().length < 2 || form.contactName.length > 180) {
        setError('Enter your full contact name.'); return;
      }
      if ((!isWalkIn || form.contactEmail.trim()) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail)) {
        setError('Enter a valid email address.'); return;
      }
      if (!normalizedPhone) {
        setError('Enter a valid contact number for the selected country.'); return;
      }
      move(5);
    }
  // `move` is intentionally a UI-only action; the latest form values drive each check.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, step, packages, form, eventType, profileStatus, normalizedPhone, isWalkIn]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) return;
    setError('');
    if (file.size > MAX_PHOTO_BYTES) { setError('Inspiration photos must be 10 MB or smaller.'); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Use JPG, PNG, or WebP images.'); return;
    }
    setBusy(true);
    try {
      const asset = await uploadImage(file, 'INSPIRATION');
      set('inspirationAssetId', asset.id);
      setPhotoName(file.name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Photo upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step !== 5 || busy || submitting.current || !consent) return;
    if (!normalizedPhone || form.contactName.trim().length < 2 || (!isWalkIn && !form.contactEmail.trim())) {
      setError('Please check your contact details before submitting.'); return;
    }
    if (!packages || (form.packageId && !packages.some(pkg => pkg.id === form.packageId))) {
      setError('Your selected package is no longer available. Please choose again.');
      move(1); return;
    }
    if (!form.eventDate || form.eventDate < todayInManila()) {
      setError('Your event date is invalid. Please select an available date.');
      move(2); return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await assertAvailableDate(form.eventDate);
      const result = await api<{ booking: { id: string; reference: string } }>(isWalkIn ? '/api/bookings/walk-in' : '/api/bookings', json('POST', {
        ...form,
        eventType,
        venue: form.venue.trim(),
        estimatedBudget: form.estimatedBudget.trim(),
        contactPhone: normalizedPhone,
        guestCount: Number(form.guestCount),
        packageId: form.packageId || null,
        inspirationAssetId: form.inspirationAssetId || null,
        consent: true,
      }));
      // The submitted screen reads the new booking directly; avoid a second
      // Router Server Component refresh after navigation.
      if (isWalkIn) {
        setCompleted({ id: result.booking.id, reference: result.booking.reference });
      } else {
        router.replace(`/client/bookings/submitted?id=${encodeURIComponent(result.booking.id)}`);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Your request could not be submitted.';
      if (/date.*(held|confirmed|unavailable)|already.*(held|confirmed)|choose an available date/i.test(message)) {
        setForm(previous => ({ ...previous, eventDate: '' }));
        move(2);
      } else if (/package unavailable|package.*no longer/i.test(message)) {
        setForm(previous => ({ ...previous, packageId: '' }));
        setPackageRefresh(value => value + 1);
        move(1);
      }
      setError(message);
      submitting.current = false;
    } finally {
      setBusy(false);
    }
  }

  if (completed && isWalkIn) return (
    <main className={styles.page}><div className={styles.shell}>
      <BookingSuccessCard reference={completed.reference} title="Walk-in inquiry recorded"
        message="The inquiry is Tentative. No client account was created. Staff will coordinate directly using the supplied contact details."
        viewHref={`${listBase}/${completed.id}`}
        onNew={() => {setCompleted(null);setStep(1);setForm({...initialValues});setCountry('PH');setConsent(false);setPhotoName('');submitting.current=false;}} />
    </div></main>
  );

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.hero}>
          <div>
            <span className={styles.eyebrow}><Sparkles size={14} /> {isWalkIn ? 'STAFF · WALK-IN INQUIRY' : 'YOUR EVENT, BEAUTIFULLY PLANNED'}</span>
            <h1>{isWalkIn ? <>Plan a walk-in <em>celebration.</em></> : <>Let’s plan something <em>memorable.</em></>}</h1>
            <p>{isWalkIn ? 'Same five-step booking experience as the client portal, with staff recording the customer’s consent.' : 'Five simple steps to tell DM Events about the celebration you have in mind.'}</p>
          </div>
          <div className={styles.heroAside} aria-hidden="true"><CalendarDays size={33} /><span>01 — 05</span><small>YOUR EVENT JOURNEY</small></div>
        </div>

        <nav className={styles.progress} aria-label="Booking request progress">
          {steps.map((item, index) => {
            const number = (index + 1) as Step;
            const Icon = item.icon;
            return (
              <button key={item.title} type="button" disabled={busy || number > step} aria-current={number === step ? 'step' : undefined}
                onClick={() => { if (number < step) move(number); }} className={`${styles.progressItem} ${number === step ? styles.progressActive : ''} ${number < step ? styles.progressDone : ''}`}>
                <span className={styles.progressIcon}>{number < step ? <Check size={17} /> : <Icon size={18} />}</span>
                <span><strong>{String(number).padStart(2, '0')} · {item.title}</strong><small>{item.subtitle}</small></span>
              </button>
            );
          })}
        </nav>

        <form className={styles.form} onSubmit={submit}>
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.stepTag}>STEP {String(step).padStart(2, '0')} / 05</span>
              <h2>{[
                'Choose your event package',
                'When is your special day?',
                'Tell us about your event',
                'Your contact information',
                'Review your booking request',
              ][step - 1]}</h2>
              <p>{[
                'Browse our published packages and choose the one that fits. You can also decide later.',
                'Check real-time availability and choose a date that works for you.',
                'A few details will help our team prepare the right quotation and plan.',
                isWalkIn ? 'Enter the walk-in customer’s contact information. Email is optional, but phone is required.' : 'We have filled these details from your account. Review and edit them if needed.',
                'Check every detail before sending your inquiry. Nothing is booked until our team confirms it.',
              ][step - 1]}</p>
            </div>

            <div className={styles.cardBody}>
              {error && <div className={styles.error} role="alert">{error}</div>}

              {step === 1 && (
                <div className={styles.packageGrid} role="radiogroup" aria-label="Select an event package">
                  {packages === null && !packageError && Array.from({ length: 3 }, (_, index) => (
                    <div key={index} className={styles.packageSkeleton}><div className={styles.skeletonImage} /><InlineSkeleton rows={3} label="Loading package" /></div>
                  ))}
                  {packageError && <div className={styles.fullWidth}><p className={styles.error} role="alert">{packageError}</p><button type="button" className={styles.secondaryButton} onClick={() => setPackageRefresh(n => n + 1)}>Retry loading packages</button></div>}
                  {packages?.map((item, index) => {
                    const selected = form.packageId === item.id;
                    return <button key={item.id} type="button" role="radio" aria-checked={selected}
                      onClick={() => { set('packageId', item.id); setPackageError(''); }}
                      className={`${styles.packageOption} ${selected ? styles.packageSelected : ''}`}>
                      <span className={styles.packageImage}>
                        {item.imageId ? <img src={`/api/assets/${item.imageId}`} alt="" loading="lazy" /> : <span className={`${styles.packageFallback} ${styles[`fallback${index % 3}`]}`}><ImageIcon size={39} strokeWidth={1.3} /></span>}
                        <span className={styles.packageBadge}>{selected ? <><Check size={13} /> SELECTED</> : 'EVENT PACKAGE'}</span>
                      </span>
                      <span className={styles.packageContent}>
                        <strong>{item.name}</strong>
                        <span className={styles.packageDesc}>{item.description}</span>
                        {item.inclusions.length > 0 && <span className={styles.inclusions}>{item.inclusions.slice(0, 3).map((inclusion, i) => <span key={`${item.id}-${i}`}><Check size={13} />{inclusion}</span>)}</span>}
                        <span className={styles.selectPrompt}>{selected ? 'Your chosen package' : 'Select this package'}<span className={styles.radioMark}>{selected && <Check size={14} />}</span></span>
                      </span>
                    </button>;
                  })}
                  {packages !== null && <button type="button" role="radio" aria-checked={!form.packageId}
                    onClick={() => set('packageId', '')} className={`${styles.packageOption} ${styles.unsure} ${!form.packageId ? styles.packageSelected : ''}`}>
                    <span className={styles.unsureIcon}><Sparkles size={30} /></span>
                    <span className={styles.packageContent}>
                      <strong>Help me choose</strong>
                      <span className={styles.packageDesc}>Not sure which package is right? Tell us about your event and our team can recommend a suitable option.</span>
                      <span className={styles.selectPrompt}>{!form.packageId ? 'Selected · Discuss later' : 'Choose this option'}<span className={styles.radioMark}>{!form.packageId && <Check size={14}/>}</span></span>
                    </span>
                  </button>}
                </div>
              )}

              {step === 2 && (
                <div className={styles.calendarArea}>
                  <AvailableDatePicker id="client-event-date" display="inline" label="Select an available preferred event date"
                    value={form.eventDate} onChange={date => { set('eventDate', date); setError(''); }} disabled={busy} />
                  <div className={styles.infoNote}><ShieldCheck size={19} /><span>Your preferred date is checked again before submission. Sending an inquiry does not reserve it.</span></div>
                </div>
              )}

              {step === 3 && (
                <div className={styles.detailForm}>
                  <div className={styles.field}>
                    <label htmlFor="booking-event-type">Event type <span>*</span></label>
                    <select id="booking-event-type" className={inputClass} value={form.eventType} onChange={e => set('eventType', e.target.value)}>
                      {eventTypes.map(item => <option key={item} value={item}>{item}</option>)}
                    </select>
                    {form.eventType === 'Other' && <input className={inputClass} value={customEventType} maxLength={120} onChange={e => setCustomEventType(e.target.value)} placeholder="Describe your event type" aria-label="Other event type" required />}
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="booking-guests">Expected guest count <span>*</span></label>
                    <div className={styles.fieldIcon}><UsersRound size={18}/><input id="booking-guests" className={inputClass} type="number" inputMode="numeric" min={1} max={100000} value={form.guestCount} onChange={e => set('guestCount', e.target.value)} placeholder="e.g. 150" required /></div>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="booking-venue">Event location / venue <em>(optional)</em></label>
                    <div className={styles.fieldIcon}><MapPin size={18}/><input id="booking-venue" className={inputClass} maxLength={2000} value={form.venue} onChange={e => set('venue', e.target.value)} placeholder="If you've chosen a venue, enter it here" /></div>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="booking-budget">Estimated budget (PHP) <span>*</span></label>
                    <div className={styles.fieldIcon}><Wallet size={18}/><input id="booking-budget" className={inputClass} maxLength={200} value={form.estimatedBudget} onChange={e => set('estimatedBudget', e.target.value)} placeholder="e.g. ₱40,000 – ₱60,000" required /></div>
                    <small>An estimate is fine. Your final quotation will be discussed with DM Events.</small>
                  </div>
                  <div className={styles.fullWidth}>
                    <button type="button" className={styles.optionalToggle} aria-expanded={showStyling} onClick={() => setShowStyling(open => !open)}>
                      <span><Sparkles size={18} /> Styling & inspiration <em>Optional</em></span><ChevronRight size={18} className={showStyling ? styles.rotate : ''} />
                    </button>
                    {showStyling && <div className={styles.stylingFields}>
                      <div className={styles.field}><label htmlFor="booking-theme">Preferred theme</label><input id="booking-theme" className={inputClass} maxLength={400} value={form.preferredTheme} onChange={e => set('preferredTheme',e.target.value)} placeholder="Garden, modern, romantic…" /></div>
                      <div className={styles.field}><label htmlFor="booking-colors">Color palette</label><input id="booking-colors" className={inputClass} maxLength={400} value={form.colorPalette} onChange={e => set('colorPalette',e.target.value)} placeholder="Ivory, champagne, sage…" /></div>
                      <div className={styles.fieldFull}><label htmlFor="booking-requests">Special requests</label><textarea id="booking-requests" className={inputClass} rows={3} maxLength={5000} value={form.specialRequests} onChange={e => set('specialRequests',e.target.value)} placeholder="Anything else our coordinators should know?" /></div>
                      <div className={styles.fieldFull}>
                        <label htmlFor="booking-inspiration">Inspiration photograph <em>(max 10 MB)</em></label>
                        <label className={styles.uploadArea} htmlFor="booking-inspiration"><UploadCloud size={23} /><span>{busy ? 'Uploading your image…' : photoName || 'Choose a photo (JPG, PNG, WebP)'}</span></label>
                        <input id="booking-inspiration" className={styles.visuallyHidden} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={upload} />
                        {form.inspirationAssetId && <div className={styles.uploadPreview}><img src={`/api/assets/${form.inspirationAssetId}`} alt="Your uploaded inspiration" /><button type="button" onClick={() => { set('inspirationAssetId', ''); setPhotoName(''); }} aria-label="Remove inspiration image"><X size={17} /></button></div>}
                      </div>
                    </div>}
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className={styles.contactArea}>
                  {!isWalkIn && profileStatus === 'loading' && <InlineSkeleton rows={3} label="Loading account contact information" />}
                  {!isWalkIn && profileStatus === 'error' && <div className={styles.infoNote}>Account details could not be loaded automatically. Please verify your contact information manually.</div>}
                  <div className={styles.detailForm}>
                    <div className={styles.field}><label htmlFor="booking-contact-name">Full name <span>*</span></label><input id="booking-contact-name" className={inputClass} autoComplete="name" value={form.contactName} onChange={e => set('contactName', e.target.value)} maxLength={180} required placeholder="Full name" /></div>
                    <div className={styles.field}><label htmlFor="booking-contact-email">Email address {isWalkIn ? <em>(optional)</em> : <span>*</span>}</label><input id="booking-contact-email" className={inputClass} type="email" autoComplete="email" value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)} maxLength={320} required={!isWalkIn} placeholder="you@example.com" /></div>
                    <div className={styles.fieldFull}><CountryPhoneInput id="booking-contact-phone" label="Contact number" country={country} number={form.contactPhone} onCountryChange={setCountry} onNumberChange={value => set('contactPhone', value)} hint="We use this number to discuss your booking details." /></div>
                  </div>
                  <div className={styles.infoNote}><UserRound size={18}/><span>{isWalkIn ? 'Record the walk-in customer’s contact information. No client portal account is created.' : 'These details were prefilled from your client account. Editing them here only changes the contact details for this request.'}</span></div>
                </div>
              )}

              {step === 5 && (
                <div className={styles.summary}>
                  <section className={styles.summaryBlock}>
                    <div className={styles.summaryHead}><h3><Sparkles size={17}/> Package</h3><button type="button" onClick={() => move(1)}>Edit</button></div>
                    <div className={styles.summaryValue}><strong>{selectedPackage?.name ?? 'Help me choose · Discuss with DM Events'}</strong>{selectedPackage?.description && <p>{selectedPackage.description}</p>}</div>
                  </section>
                  <section className={styles.summaryBlock}>
                    <div className={styles.summaryHead}><h3><CalendarDays size={17}/> Preferred date</h3><button type="button" onClick={() => move(2)}>Edit</button></div>
                    <div className={styles.summaryValue}><strong>{readableDate(form.eventDate)}</strong><small>Subject to availability and confirmation by DM Events</small></div>
                  </section>
                  <section className={styles.summaryBlock}>
                    <div className={styles.summaryHead}><h3><PartyPopper size={17}/> Event details</h3><button type="button" onClick={() => move(3)}>Edit</button></div>
                    <dl className={styles.summaryRows}><div><dt>Event type</dt><dd>{eventType}</dd></div><div><dt>Expected guests</dt><dd>{form.guestCount}</dd></div><div><dt>Event location</dt><dd>{form.venue.trim() || 'Not decided yet'}</dd></div><div><dt>Estimated budget</dt><dd>{form.estimatedBudget}</dd></div>{form.preferredTheme && <div><dt>Theme</dt><dd>{form.preferredTheme}</dd></div>}{form.colorPalette && <div><dt>Colors</dt><dd>{form.colorPalette}</dd></div>}{form.specialRequests && <div><dt>Special requests</dt><dd>{form.specialRequests}</dd></div>}{form.inspirationAssetId && <div><dt>Inspiration</dt><dd>Photo attached</dd></div>}</dl>
                  </section>
                  <section className={styles.summaryBlock}>
                    <div className={styles.summaryHead}><h3><UserRound size={17}/> Contact information</h3><button type="button" onClick={() => move(4)}>Edit</button></div>
                    <dl className={styles.summaryRows}><div><dt>Full name</dt><dd>{form.contactName}</dd></div><div><dt>Email</dt><dd>{form.contactEmail}</dd></div><div><dt>Phone</dt><dd>{normalizedPhone || form.contactPhone}</dd></div></dl>
                  </section>
                  <div className={styles.confirmBox}>
                    <ShieldCheck size={22}/>
                    <div><strong>A request is not a confirmed reservation.</strong><p>DM Events will review your date and details, then contact you about availability and a personalized quotation.</p></div>
                  </div>
                  <label className={styles.privacy}><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required /><span>{isWalkIn ? 'I have explained the Privacy Policy to the walk-in customer, obtained their acknowledgment, and recorded consent here. This remains a tentative inquiry.' : <>I have reviewed my details, acknowledge the <Link href="/privacy" target="_blank">Privacy Policy</Link>, and understand that this is a tentative request.</>}</span></label>
                </div>
              )}
            </div>
          </div>
          <div className={styles.actions}>
            <div className={styles.stepCount}>Step {step} of 5 <span>·</span> {steps[step - 1].title}</div>
            <div className={styles.actionButtons}>
              {step > 1 && <button type="button" disabled={busy} className={styles.secondaryButton} onClick={() => move((step - 1) as Step)}><ChevronLeft size={18} /> Back</button>}
              {step < 5 ? <button type="button" disabled={busy || (step === 1 && packages === null)} className={styles.primaryButton} onClick={() => void continueStep()}>{busy ? 'Checking…' : 'Continue'} <ChevronRight size={18} /></button>
                : <button type="submit" disabled={busy || !consent} className={styles.primaryButton}>{busy ? 'Submitting…' : isWalkIn ? 'Record walk-in inquiry' : 'Confirm & submit request'} <CheckCircle2 size={18}/></button>}
            </div>
          </div>
          <p className={styles.securityFoot}><ShieldCheck size={15}/> {isWalkIn ? 'Authorized staff inquiry · Client consent recorded · No client portal account' : 'Secure client inquiry · We only use your information to plan and coordinate your event.'}</p>
        </form>
        <div className={styles.help}><p>{isWalkIn ? 'Need to return to the booking list?' : 'Have questions about the process?'}</p><Link href={isWalkIn ? listBase : '/packages'}>{isWalkIn ? 'Return to bookings' : 'Explore all packages'} <ArrowRight size={15}/></Link></div>
      </div>
    </main>
  );
}
