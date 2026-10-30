'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertCircle, ArrowLeft, ArrowRight, CalendarCheck2, CalendarDays, Check,
  CheckCheck, CheckCircle2, ChevronDown, Clock3, ClipboardList, Copy,
  Edit3, ExternalLink, HeartHandshake, ImageIcon, Info, Mail, MapPin,
  MessageCircle, MessageSquareText, Package, Palette, Paintbrush,
  PartyPopper, RefreshCw, ShieldCheck, Sparkles, UsersRound, Wallet, X,
} from 'lucide-react';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { DetailSkeleton } from '@/components/ui/LoadingSkeleton';
import { api, json } from '@/api-client/http';
import { niceDate } from '@/components/ui/Blocks';
import BookingChangeDialog, { type BookingChange } from '@/components/ui/BookingChangeDialog';
import { BookingStatus } from '@/components/ui/BookingSurface';
import styles from './BookedEventDetail.module.css';

type Detail = {
  id: string;
  reference: string;
  eventType: string;
  eventDate: string;
  eventStartTime: string | null;
  eventEndTime: string | null;
  venue: string;
  status: string;
  guestCount: number;
  estimatedBudget: string;
  bookedValue?: string | null;
  createdAt?: string;
  preferredTheme: string;
  colorPalette: string;
  specialRequests: string;
  inspirationAssetId: string | null;
  reviewNote: string | null;
  cancellationRequestedAt: string | null;
  cancellationReason: string | null;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  client?: { fullName: string; email: string; phone: string | null } | null;
  package: {
    name: string;
    description?: string;
    inclusions?: string[];
    imageId?: string | null;
    published?: boolean;
  } | null;
  history: {
    id: string;
    toStatus: string;
    note: string | null;
    actorName: string | null;
    createdAt: string;
  }[];
};

type StatusView = { label: string; heading: string; description: string; guidance: string; stage: number };

const statusViews: Record<string, StatusView> = {
  TENTATIVE: {
    label: 'REQUEST RECEIVED', heading: 'Your event journey has begun',
    description: 'Your inquiry is with the DM Events team for review.',
    guidance: 'This date is a preference only. It is not reserved until your booking is placed on hold or confirmed.',
    stage: 0,
  },
  HELD: {
    label: 'DATE ON HOLD', heading: 'Your preferred date is reserved',
    description: 'DM Events has placed a hold on your event date while final details are reviewed.',
    guidance: 'Your date is held but the booking is not yet confirmed. Keep in touch with the team to finalize the arrangements.',
    stage: 1,
  },
  CONFIRMED: {
    label: 'BOOKING CONFIRMED', heading: 'It’s officially happening',
    description: 'Your event booking has been confirmed by DM Events.',
    guidance: 'Your date is confirmed. Review the schedule and contact the team for any remaining coordination details.',
    stage: 2,
  },
  CANCELLED: {
    label: 'BOOKING CANCELLED', heading: 'This booking has been cancelled',
    description: 'This event request is no longer active.',
    guidance: 'If you need clarification or wish to plan another event, you can message the DM Events team.',
    stage: -1,
  },
};

const journey = [
  { title: 'Request submitted', note: 'Your details were received' },
  { title: 'Date placed on hold', note: 'DM Events reserves the date' },
  { title: 'Booking confirmed', note: 'The event is confirmed' },
];

function display(value: string | number | null | undefined, fallback = 'Not yet provided') {
  return value === null || value === undefined || String(value).trim() === '' ? fallback : String(value);
}

function formattedTime(value: string | null | undefined) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return '';
  const [h, m] = value.split(':').map(Number);
  if (h > 23 || m > 59) return value;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function formatCurrency(value: string | null | undefined) {
  if (!value) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(amount);
}

function DetailItem({ icon, label, value, wide = false }: { icon: ReactNode; label: string; value: ReactNode; wide?: boolean }) {
  return <div className={`${styles.fact} ${wide ? styles.factWide : ''}`}>
    <span className={styles.factIcon} aria-hidden="true">{icon}</span>
    <div className={styles.factBody}>
      <span className={styles.factLabel}>{label}</span>
      <span className={styles.factValue}>{value}</span>
    </div>
  </div>;
}

function Section({ icon, eyebrow, title, description, children, action }: {
  icon: ReactNode; eyebrow: string; title: string; description?: string; children: ReactNode; action?: ReactNode;
}) {
  return <section className={styles.section}>
    <div className={styles.sectionHead}>
      <div className={styles.sectionIntro}>
        <span className={styles.sectionIcon} aria-hidden="true">{icon}</span>
        <div className={styles.sectionTitles}>
          <span className={styles.sectionEyebrow}>{eyebrow}</span>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </div>
      {action}
    </div>
    <div className={styles.sectionBody}>{children}</div>
  </section>;
}

export default function BookingDetail({ id }: { id: string }) {
  const { data, error, loading, refresh } = useLiveQuery(() => api<{ booking: Detail }>(`/api/bookings/${id}`), [id],{cacheKey:`client:/api/bookings/${id}`,realtimeKinds:['bookings','booking_history']});
  const booking = data?.booking;
  const [cancelReason, setCancelReason] = useState('');
  const [showCancellation, setShowCancellation] = useState(false);
  const [edit, setEdit] = useState(false);
  const [theme, setTheme] = useState('');
  const [colors, setColors] = useState('');
  const [requests, setRequests] = useState('');
  const [message, setMessage] = useState('');
  const [messageSuccess, setMessageSuccess] = useState(false);
  const [savedChanges, setSavedChanges] = useState<BookingChange[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Next.js can reuse this component when navigating between booking IDs.
  // Never show an old booking's editing, cancellation or success state on a new one.
  useEffect(() => {
    setCancelReason(''); setShowCancellation(false); setEdit(false);
    setTheme(''); setColors(''); setRequests('');
    setMessage(''); setMessageSuccess(false); setSavedChanges([]);
    setConfirmationOpen(false); setCopied(false);
  }, [id]);

  async function cancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage(''); setSavedChanges([]);
    try {
      const result = await api<{ message: string }>(`/api/bookings/${id}/cancel`, json('POST', { reason: cancelReason.trim() }));
      setMessage(result.message); setMessageSuccess(true); setCancelReason(''); setShowCancellation(false);
      await refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Cancellation request failed.'); setMessageSuccess(false);
    } finally { setBusy(false); }
  }

  const preferenceChanges: BookingChange[] = booking ? [
    ...(theme.trim() !== (booking.preferredTheme || '').trim() ? [{ label: 'Preferred theme', before: booking.preferredTheme || 'Not set', after: theme.trim() || 'Not set' }] : []),
    ...(colors.trim() !== (booking.colorPalette || '').trim() ? [{ label: 'Color palette', before: booking.colorPalette || 'Not set', after: colors.trim() || 'Not set' }] : []),
    ...(requests.trim() !== (booking.specialRequests || '').trim() ? [{ label: 'Special requests', before: booking.specialRequests || 'Not set', after: requests.trim() || 'Not set' }] : []),
  ] : [];

  function previewSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(''); setSavedChanges([]);
    if (!booking || busy) return;
    if (!preferenceChanges.length) { setMessage('No changes to save.'); setMessageSuccess(false); return; }
    setConfirmationOpen(true);
  }

  async function save() {
    if (busy || !confirmationOpen || !booking) return;
    setBusy(true); setMessage('');
    const changes = [...preferenceChanges];
    try {
      await api(`/api/bookings/${id}`, json('PATCH', {
        preferredTheme: theme.trim(), colorPalette: colors.trim(), specialRequests: requests.trim(),
      }));
      setConfirmationOpen(false); setEdit(false);
      setSavedChanges(changes);
      setMessage('Your event preferences were saved successfully.'); setMessageSuccess(true);
      await refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Unable to update preferences.'); setMessageSuccess(false);
    } finally { setBusy(false); }
  }

  function togglePreferences() {
    if (!booking || busy) return;
    setEdit(previous => !previous);
    setTheme(booking.preferredTheme ?? ''); setColors(booking.colorPalette ?? ''); setRequests(booking.specialRequests ?? '');
    setMessage(''); setSavedChanges([]);
  }

  async function copyReference() {
    if (!booking || !navigator.clipboard?.writeText) return;
    try { await navigator.clipboard.writeText(booking.reference); setCopied(true); }
    catch { setCopied(false); }
  }

  const info = booking ? statusViews[booking.status] ?? statusViews.TENTATIVE : statusViews.TENTATIVE;
  const isEditable = !!booking && ['TENTATIVE', 'HELD'].includes(booking.status);
  const schedule = booking?.eventStartTime && booking?.eventEndTime
    ? `${formattedTime(booking.eventStartTime)} – ${formattedTime(booking.eventEndTime)}`
    : 'To be coordinated';
  const packageImage = booking?.package?.published && booking.package.imageId
    ? `/api/assets/${booking.package.imageId}` : null;

  return <main className={styles.page}>
    <div className={styles.container}>
      <div className={styles.topBar}>
        <Link href="/client/bookings" className={styles.backLink}><ArrowLeft size={16}/> My bookings</Link>
        {booking && <div className={styles.referenceBar}>
          <span>Booking reference</span>
          <strong>{booking.reference}</strong>
          <button type="button" className={styles.copyButton} onClick={() => void copyReference()} aria-label="Copy booking reference" title="Copy booking reference">
            {copied ? <Check size={15}/> : <Copy size={15}/>}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>}
      </div>

      <header className={styles.hero}>
        <div className={styles.heroContent}>
          <span className={styles.eyebrow}><Sparkles size={15}/>{info.label}</span>
          <h1>{booking ? booking.eventType : 'Your booked event'}</h1>
          <p>{booking ? info.heading : 'Everything about your event, all in one place.'}</p>
          <div className={styles.heroChips}>
            {booking && <>
              <span><CalendarDays size={15}/>{niceDate(booking.eventDate)}</span>
              <span><Package size={15}/>{booking.package?.name || 'Custom event inquiry'}</span>
            </>}
          </div>
        </div>
        <div className={styles.heroAside}>
          <span className={styles.heroSeal}><PartyPopper size={35} strokeWidth={1.25}/></span>
          {booking && <BookingStatus value={booking.status}/>}
          <span className={styles.heroAsideCaption}>Your event, carefully planned.</span>
        </div>
      </header>

      {loading && !booking ? <div className={styles.loading}><DetailSkeleton/></div>
        : !booking ? <div className={styles.loadingError} role={error ? 'alert' : 'status'}>
          <AlertCircle size={23}/><h2>Event details unavailable</h2>
          <p>{error || 'We could not load this booking. Please try again.'}</p>
          <button type="button" className={styles.primaryButton} onClick={() => void refresh()}><RefreshCw size={16}/> Try again</button>
        </div> : <>
          {error && <div role="alert" className={styles.errorBanner}>
            <AlertCircle size={18}/><span>Unable to refresh the latest details: {error}</span>
            <button type="button" onClick={() => void refresh()}>Retry</button>
          </div>}

          <div className={styles.statusCard}>
            <div className={styles.statusText}>
              <span className={styles.miniEyebrow}>CURRENT BOOKING STATUS</span>
              <div className={styles.statusHeading}><h2>{info.heading}</h2><BookingStatus value={booking.status}/></div>
              <p>{info.description}</p>
            </div>
            <ol className={styles.journey} aria-label="Booking progress">
              {journey.map((item, index) => <li key={item.title}
                className={`${styles.journeyStep} ${info.stage >= index ? styles.journeyComplete : ''} ${info.stage === index ? styles.journeyActive : ''}`}>
                <span className={styles.stepCircle}>{info.stage >= index ? <Check size={15}/> : index + 1}</span>
                <span className={styles.stepCopy}><strong>{item.title}</strong><small>{item.note}</small></span>
              </li>)}
            </ol>
            <div className={`${styles.statusNotice} ${booking.status === 'CANCELLED' ? styles.statusNoticeCancelled : ''}`}>
              <Info size={17} aria-hidden="true"/><span>{info.guidance}</span>
            </div>
          </div>

          {message && <div role={messageSuccess ? 'status' : 'alert'} className={`${styles.feedback} ${messageSuccess ? styles.feedbackSuccess : styles.feedbackError}`}>
            <span className={styles.feedbackIcon}>{messageSuccess ? <CheckCircle2 size={23}/> : <AlertCircle size={23}/>}</span>
            <div className={styles.feedbackCopy}>
              <h2>{messageSuccess ? 'Update received' : 'Unable to complete request'}</h2><p>{message}</p>
              {messageSuccess && savedChanges.length > 0 && <ul className={styles.savedList}>
                {savedChanges.map(change => <li key={change.label}><Check size={14}/><span><strong>{change.label}:</strong> {change.after}</span></li>)}
              </ul>}
            </div>
            <button type="button" aria-label="Dismiss feedback" onClick={() => { setMessage(''); setSavedChanges([]); }} className={styles.closeFeedback}><X size={18}/></button>
          </div>}

          <div className={styles.layout}>
            <div className={styles.primaryColumn}>
              <Section icon={<CalendarCheck2 size={22}/>} eyebrow="01 / EVENT PLAN" title="Your event at a glance"
                description="The details submitted with your booking request.">
                <div className={styles.featureDate}>
                  <div className={styles.dateIcon}><CalendarDays size={24}/></div>
                  <div><span>Preferred event date</span><strong>{niceDate(booking.eventDate)}</strong><small>{booking.status === 'TENTATIVE' ? 'Preferred only · Not yet reserved' : booking.status === 'CANCELLED' ? 'Booking cancelled' : 'Date held or confirmed by DM Events'}</small></div>
                  <div className={styles.featureTime}><Clock3 size={17}/><span>{schedule}</span></div>
                </div>
                <div className={styles.factsGrid}>
                  <DetailItem icon={<PartyPopper size={20}/>} label="Event type" value={booking.eventType}/>
                  <DetailItem icon={<UsersRound size={20}/>} label="Expected guests" value={`${booking.guestCount.toLocaleString('en-PH')} ${booking.guestCount === 1 ? 'guest' : 'guests'}`}/>
                  <DetailItem icon={<MapPin size={20}/>} label="Event venue" value={display(booking.venue, 'Venue to be finalized')} wide/>
                  <DetailItem icon={<Wallet size={20}/>} label="Estimated budget" value={display(booking.estimatedBudget, 'Not specified')}/>
                  {booking.bookedValue !== null && booking.bookedValue !== undefined && <DetailItem icon={<ShieldCheck size={20}/>} label="Recorded booking value" value={formatCurrency(booking.bookedValue) || 'Not recorded'}/>}
                </div>
                <div className={styles.finePrint}><Info size={15}/><span>Estimated budget and recorded booking value do not indicate an invoice or payment received.</span></div>
              </Section>

              <Section icon={<Package size={22}/>} eyebrow="02 / SELECTED EXPERIENCE" title="Your event package"
                description="The package selected when you made your inquiry.">
                <div className={styles.packageCard}>
                  <div className={styles.packageVisual}>
                    {packageImage ? /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={packageImage} alt="Selected event package" loading="lazy" className={styles.packagePhoto}/>
                      : <div className={styles.packagePlaceholder}><Sparkles size={34}/><span>DM EVENTS</span></div>}
                  </div>
                  <div className={styles.packageText}>
                    <span className={styles.miniEyebrow}>CHOSEN PACKAGE</span>
                    <h3>{booking.package?.name || 'Custom event request'}</h3>
                    {booking.package?.description && <p>{booking.package.description}</p>}
                    {booking.package?.inclusions && booking.package.inclusions.length > 0 && <>
                      <span className={styles.inclusionTitle}>PACKAGE INCLUSIONS</span>
                      <ul className={styles.inclusionList}>
                        {booking.package.inclusions.map((inclusion, index) => <li key={`${index}-${inclusion}`}><CheckCircle2 size={15}/><span>{inclusion}</span></li>)}
                      </ul>
                    </>}
                    {!booking.package && <p>Our team will help you plan a package that fits your event.</p>}
                  </div>
                </div>
              </Section>

              <Section icon={<Palette size={22}/>} eyebrow="03 / YOUR VISION" title="Styling & personal touches"
                description="The preferences that help our team understand your event style."
                action={isEditable && <button type="button" className={styles.textAction} onClick={togglePreferences} aria-expanded={edit}>
                  <Edit3 size={15}/>{edit ? 'Close editor' : 'Edit preferences'}
                </button>}>
                <div className={styles.preferenceGrid}>
                  <div className={styles.preference}><span className={styles.preferenceIcon}><Paintbrush size={18}/></span><span className={styles.factLabel}>Preferred theme</span><strong>{display(booking.preferredTheme)}</strong></div>
                  <div className={styles.preference}><span className={styles.preferenceIcon}><Palette size={18}/></span><span className={styles.factLabel}>Color palette</span><strong>{display(booking.colorPalette)}</strong></div>
                </div>
                <div className={styles.requestsBox}><span className={styles.requestsHeading}><MessageSquareText size={17}/> Special requests</span><p>{display(booking.specialRequests, 'You have not added any special requests.')}</p></div>
                {booking.inspirationAssetId && <div className={styles.inspiration}>
                  <div className={styles.inspirationHeading}><ImageIcon size={17}/><span>Your inspiration image</span></div>
                  <a href={`/api/assets/${booking.inspirationAssetId}`} target="_blank" rel="noopener noreferrer" className={styles.imageLink}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/assets/${booking.inspirationAssetId}`} loading="lazy" alt="Your event inspiration"/>
                    <span>View full image <ExternalLink size={15}/></span>
                  </a>
                </div>}
                {edit && isEditable && <div className={styles.editor}>
                  <div className={styles.editorHeader}><div><h3>Refine your event preferences</h3><p>Review your edits before saving them.</p></div><span><Edit3 size={17}/></span></div>
                  <form onSubmit={previewSave} className={styles.editorForm}>
                    <div className={styles.editorFields}>
                      <label htmlFor="client-theme"><span>Preferred theme</span><input id="client-theme" className={styles.input} maxLength={400} value={theme} onChange={event => setTheme(event.target.value)} placeholder="e.g. Garden elegance"/></label>
                      <label htmlFor="client-colors"><span>Color palette</span><input id="client-colors" className={styles.input} maxLength={400} value={colors} onChange={event => setColors(event.target.value)} placeholder="e.g. Ivory, sage, gold"/></label>
                      <label className={styles.fullField} htmlFor="client-requests"><span>Special requests</span><textarea id="client-requests" className={styles.input} maxLength={5000} rows={4} value={requests} onChange={event => setRequests(event.target.value)} placeholder="Share any details you want our team to know"/></label>
                    </div>
                    <div className={styles.editorFooter}><p>You can update these details while your booking is Tentative or Held.</p>
                      <div className={styles.editorActions}><button className={styles.secondaryButton} type="button" disabled={busy} onClick={togglePreferences}>Cancel</button>
                        <button type="submit" className={styles.primaryButton} disabled={busy || !preferenceChanges.length}><CheckCircle2 size={16}/> Review {preferenceChanges.length} {preferenceChanges.length === 1 ? 'change' : 'changes'}</button>
                      </div>
                    </div>
                  </form>
                </div>}
              </Section>

              <Section icon={<ClipboardList size={22}/>} eyebrow="04 / ACTIVITY" title="Your booking journey"
                description="Status updates from DM Events, newest first.">
                {booking.history?.length ? <ol className={styles.timeline} aria-label="Booking activity history">
                  {booking.history.map(item => <li key={item.id} className={styles.timelineItem}>
                    <span className={styles.timelineMarker}><Check size={14}/></span>
                    <div className={styles.timelineText}>
                      <div className={styles.timelineTop}><BookingStatus value={item.toStatus}/><time dateTime={item.createdAt}>{niceDate(item.createdAt)}</time></div>
                      <strong>{item.actorName || 'DM Events team'}</strong>
                      <p>{display(item.note, 'Booking status updated')}</p>
                    </div>
                  </li>)}
                </ol> : <div className={styles.emptyTimeline}><Clock3 size={22}/><p>Your first status update will appear here after the team reviews your request.</p></div>}
                {booking.createdAt && <div className={styles.createdAt}><CheckCheck size={16}/> Request submitted on {niceDate(booking.createdAt)}</div>}
              </Section>
            </div>

            <aside className={styles.sidebar}>
              <div className={styles.contactCard}>
                <div className={styles.contactIcon}><HeartHandshake size={29}/></div>
                <span className={styles.miniEyebrow}>WE'RE HERE TO HELP</span>
                <h2>Planning feels better together.</h2>
                <p>Have a question, want to share an idea, or need an update? Your event conversation is just one click away.</p>
                <Link href={`/client/messages?booking=${id}`} className={styles.goldButton}><MessageCircle size={18}/> Message DM Events <ArrowRight size={17}/></Link>
                <Link href="/client/bookings" className={styles.contactLink}><ArrowLeft size={15}/> All my bookings</Link>
              </div>

              {booking.reviewNote && <div className={styles.sideCard}>
                <div className={styles.sideHead}><Mail size={19}/><h2>Latest update from the team</h2></div>
                <p className={styles.reviewNote}>{booking.reviewNote}</p>
              </div>}

              <div className={styles.sideCard}>
                <div className={styles.sideHead}><UsersRound size={19}/><h2>Your booking contact</h2></div>
                <dl className={styles.contactDetails}>
                  <div><dt>Full name</dt><dd>{display(booking.client?.fullName || booking.contactName)}</dd></div>
                  <div><dt>Email address</dt><dd>{display(booking.client?.email || booking.contactEmail)}</dd></div>
                  <div><dt>Contact number</dt><dd>{display(booking.client?.phone || booking.contactPhone)}</dd></div>
                </dl>
                <p className={styles.sideHint}>To update your profile contact information, visit your <Link href="/client/profile">profile</Link>.</p>
              </div>

              <div className={styles.sideCard}>
                <div className={styles.sideHead}><ShieldCheck size={19}/><h2>Cancellation request</h2></div>
                {booking.status === 'CANCELLED' ? <div className={styles.noticeDanger}><AlertCircle size={18}/> This booking has been cancelled.</div>
                  : booking.cancellationRequestedAt ? <div className={styles.noticeWarn}><AlertCircle size={18}/><div><strong>Awaiting review</strong><p>Your cancellation request is pending. Your booking remains {booking.status.toLowerCase()} until DM Events reviews it.</p>{booking.cancellationReason && <p className={styles.cancellationReason}>Reason: {booking.cancellationReason}</p>}</div></div>
                  : <>
                    <p className={styles.sideHint}>If your plans change, you can request cancellation for the team to review. It will not cancel your booking immediately.</p>
                    <button type="button" className={styles.cancelToggle} onClick={() => setShowCancellation(previous => !previous)} aria-expanded={showCancellation}><ChevronDown size={16} className={showCancellation ? styles.rotate : ''}/>{showCancellation ? 'Close cancellation form' : 'Request cancellation review'}</button>
                    {showCancellation && <form className={styles.cancelForm} onSubmit={cancel}>
                      <label htmlFor="cancellation-reason">Reason for cancellation request</label>
                      <textarea id="cancellation-reason" required minLength={3} maxLength={2000} rows={4} className={styles.input} value={cancelReason} onChange={event => setCancelReason(event.target.value)} placeholder="Please let us know why your plans changed"/>
                      <p>Sending this request does not automatically cancel your booking or release your event date.</p>
                      <button disabled={busy} className={styles.dangerButton} type="submit">{busy ? 'Submitting request…' : 'Submit cancellation request'} <ArrowRight size={16}/></button>
                    </form>}
                  </>}
              </div>
            </aside>
          </div>
        </>}

      <BookingChangeDialog open={confirmationOpen} reference={booking?.reference ?? ''} changes={preferenceChanges}
        error={messageSuccess ? '' : message} busy={busy} onCancel={() => { if (!busy) setConfirmationOpen(false); }}
        onConfirm={() => void save()}/>
    </div>
  </main>;
}
