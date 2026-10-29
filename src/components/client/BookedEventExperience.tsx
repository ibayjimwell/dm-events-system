'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertCircle, ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2,
  ChevronDown, Clock3, ClipboardList, Copy, ExternalLink, HeartHandshake,
  Image as ImageIcon, Info, MapPin, MessageCircle, MessageSquareText,
  Package as PackageIcon, Palette, Pencil, RefreshCw, ShieldCheck,
  Sparkles, UsersRound, Wallet, X,
} from 'lucide-react';
import { api, json } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { DetailSkeleton } from '@/components/ui/LoadingSkeleton';
import BookingChangeDialog, { type BookingChange } from '@/components/ui/BookingChangeDialog';
import { BookingStatus } from '@/components/ui/BookingSurface';
import { niceDate } from '@/components/ui/Blocks';
import s from './BookedEventExperience.module.css';

type Booking = {
  id: string;
  reference: string;
  eventType: string;
  eventDate: string;
  eventStartTime: string | null;
  eventEndTime: string | null;
  venue: string | null;
  status: string;
  guestCount: number;
  estimatedBudget: string | null;
  bookedValue?: string | null;
  createdAt?: string | null;
  preferredTheme: string | null;
  colorPalette: string | null;
  specialRequests: string | null;
  inspirationAssetId: string | null;
  reviewNote: string | null;
  cancellationRequestedAt: string | null;
  cancellationReason: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  client?: { fullName: string; email: string; phone: string | null } | null;
  package: {
    name: string;
    description?: string | null;
    inclusions?: string[] | null;
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

type StatusInfo = { eyebrow: string; headline: string; explanation: string; next: string; stage: number };
const statusInfo: Record<string, StatusInfo> = {
  TENTATIVE: {
    eyebrow: 'IN REVIEW', headline: 'Your event request is in good hands.',
    explanation: 'Our team is reviewing your preferred date, selected package and event details.',
    next: 'Your preferred date is not reserved yet. Watch for an update from DM Events or send a message if you need to clarify anything.',
    stage: 0,
  },
  HELD: {
    eyebrow: 'DATE HELD', headline: 'Your date is on hold.',
    explanation: 'We have reserved the date temporarily while final arrangements are being coordinated.',
    next: 'Keep in touch with our team to finalize your event details. Your booking is not yet confirmed.',
    stage: 1,
  },
  CONFIRMED: {
    eyebrow: 'CONFIRMED', headline: 'Your celebration is officially on the calendar.',
    explanation: 'Your event booking has been confirmed by the DM Events team.',
    next: 'Review the event plan and coordinate any remaining details with our team before your event day.',
    stage: 2,
  },
  CANCELLED: {
    eyebrow: 'CANCELLED', headline: 'This event request is closed.',
    explanation: 'Your booking has been cancelled and is no longer active.',
    next: 'If you would like to plan a different event or discuss this booking, message our team.',
    stage: -1,
  },
};
const milestones = [
  { title: 'Request submitted', detail: 'Booking received' },
  { title: 'Date held', detail: 'Date reserved' },
  { title: 'Confirmed', detail: 'Event secured' },
];

function shown(value: string | number | null | undefined, fallback = 'To be confirmed') {
  return value === null || value === undefined || String(value).trim() === '' ? fallback : String(value);
}

function humanTime(value?: string | null) {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return value;
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function dateBadge(value: string) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  if (!parts) return { month: 'EVENT', day: '—', weekday: '' };
  const d = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), 12);
  if (Number.isNaN(d.getTime())) return { month: 'EVENT', day: '—', weekday: '' };
  return {
    month: d.toLocaleDateString('en-PH', { month: 'short' }).toUpperCase(),
    day: String(d.getDate()),
    weekday: d.toLocaleDateString('en-PH', { weekday: 'long' }),
  };
}

function php(value: string | null | undefined) {
  if (value === null || value === undefined || value.trim() === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount)
    : value;
}

function ContentSection({ id, number, title, subtitle, action, children }: {
  id: string; number: string; title: string; subtitle?: string; action?: ReactNode; children: ReactNode;
}) {
  return <section id={id} className={s.section}>
    <div className={s.sectionHead}>
      <div className={s.sectionHeading}>
        <span className={s.sectionNumber}>{number}</span>
        <div><h2 className={s.sectionTitle}>{title}</h2>{subtitle && <p className={s.sectionSubtitle}>{subtitle}</p>}</div>
      </div>
      {action}
    </div>
    <div className={s.sectionContent}>{children}</div>
  </section>;
}

function Fact({ icon, label, children, wide = false }: {
  icon: ReactNode; label: string; children: ReactNode; wide?: boolean;
}) {
  return <div className={`${s.fact} ${wide ? s.factWide : ''}`}>
    <span className={s.factIcon}>{icon}</span>
    <div><span className={s.factLabel}>{label}</span><strong className={s.factValue}>{children}</strong></div>
  </div>;
}

export default function BookedEventExperience({ id }: { id: string }) {
  const { data, error, loading, refresh } = useLiveQuery(() => api<{ booking: Booking }>(`/api/bookings/${id}`), [id]);
  const booking = data?.booking;
  const [editing, setEditing] = useState(false);
  const [theme, setTheme] = useState('');
  const [colors, setColors] = useState('');
  const [requests, setRequests] = useState('');
  const [confirmChanges, setConfirmChanges] = useState(false);
  const [savedChanges, setSavedChanges] = useState<BookingChange[]>([]);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setEditing(false); setTheme(''); setColors(''); setRequests('');
    setConfirmChanges(false); setSavedChanges([]); setFeedback(null);
    setCancelOpen(false); setCancelReason(''); setBusy(false); setCopied(false);
  }, [id]);

  const info = statusInfo[booking?.status ?? ''] || statusInfo.TENTATIVE;
  const editable = !!booking && (booking.status === 'TENTATIVE' || booking.status === 'HELD');
  const date = dateBadge(booking?.eventDate || '');
  const packagePhoto = booking?.package?.published && booking.package.imageId
    ? `/api/assets/${encodeURIComponent(booking.package.imageId)}` : null;
  const inspirationPhoto = booking?.inspirationAssetId
    ? `/api/assets/${encodeURIComponent(booking.inspirationAssetId)}` : null;
  const schedule = [humanTime(booking?.eventStartTime), humanTime(booking?.eventEndTime)].filter(Boolean).join(' – ') || 'Schedule pending';
  const changes: BookingChange[] = booking ? [
    ...(theme.trim() !== (booking.preferredTheme || '').trim()
      ? [{ label: 'Preferred theme', before: booking.preferredTheme || 'Not set', after: theme.trim() || 'Not set' }] : []),
    ...(colors.trim() !== (booking.colorPalette || '').trim()
      ? [{ label: 'Color palette', before: booking.colorPalette || 'Not set', after: colors.trim() || 'Not set' }] : []),
    ...(requests.trim() !== (booking.specialRequests || '').trim()
      ? [{ label: 'Special requests', before: booking.specialRequests || 'Not set', after: requests.trim() || 'Not set' }] : []),
  ] : [];

  function editPreferences() {
    if (!booking || busy || !editable) return;
    if (!editing) {
      setTheme(booking.preferredTheme || '');
      setColors(booking.colorPalette || '');
      setRequests(booking.specialRequests || '');
    }
    setEditing(!editing);
    setFeedback(null);
    setSavedChanges([]);
  }

  function requestReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy && editable && changes.length) { setFeedback(null); setConfirmChanges(true); }
  }

  async function savePreferences() {
    if (!confirmChanges || busy || !editable || !booking) return;
    const preview = [...changes];
    if (!preview.length) { setConfirmChanges(false); return; }
    setBusy(true); setFeedback(null);
    try {
      await api(`/api/bookings/${id}`, json('PATCH', {
        preferredTheme: theme.trim(),
        colorPalette: colors.trim(),
        specialRequests: requests.trim(),
      }));
      setEditing(false); setConfirmChanges(false); setSavedChanges(preview);
      setFeedback({ success: true, message: 'Your event preferences were saved. DM Events can now see your updates.' });
      await refresh();
    } catch (caught) {
      setFeedback({ success: false, message: caught instanceof Error ? caught.message : 'Unable to save preferences.' });
    } finally { setBusy(false); }
  }

  async function submitCancellation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !booking || booking.status === 'CANCELLED' || booking.cancellationRequestedAt) return;
    setBusy(true); setFeedback(null); setSavedChanges([]);
    try {
      const response = await api<{ message: string }>(`/api/bookings/${id}/cancel`, json('POST', { reason: cancelReason.trim() }));
      setFeedback({ success: true, message: response.message });
      setCancelOpen(false); setCancelReason('');
      await refresh();
    } catch (caught) {
      setFeedback({ success: false, message: caught instanceof Error ? caught.message : 'Unable to request cancellation.' });
    } finally { setBusy(false); }
  }

  async function copyReference() {
    if (!booking || !navigator.clipboard?.writeText) return;
    try { await navigator.clipboard.writeText(booking.reference); setCopied(true); }
    catch { setCopied(false); }
  }

  return <main className={s.page} data-client-booked-event-experience="v2">
    <div className={s.shell}>
      <div className={s.toolbar}>
        <Link href="/client/bookings" className={s.back}><ArrowLeft size={17}/> My bookings</Link>
        {booking && <div className={s.reference}>
          <span>REFERENCE</span><strong>{booking.reference}</strong>
          <button type="button" onClick={() => void copyReference()} title="Copy reference" aria-label="Copy booking reference"><Copy size={16}/><span>{copied ? 'Copied' : 'Copy'}</span></button>
        </div>}
      </div>

      {!booking && loading ? <div className={s.loader}><DetailSkeleton/></div>
        : !booking ? <div className={s.errorPanel} role={error ? 'alert' : 'status'}>
          <AlertCircle size={31}/><h1>We couldn't load your event.</h1>
          <p>{error || 'Your event details are temporarily unavailable.'}</p>
          <button className={s.buttonPrimary} onClick={() => void refresh()} type="button"><RefreshCw size={17}/> Try again</button>
        </div> : <>
        <div className={s.hero}>
          <div className={s.heroText}>
            <div className={s.heroEyebrow}><Sparkles size={15}/> DM EVENTS · YOUR EVENT SPACE</div>
            <div className={s.heroStatus}><BookingStatus value={booking.status}/><span>{info.eyebrow}</span></div>
            <h1 className={s.heroTitle}>{booking.eventType}</h1>
            <p className={s.heroDescription}>{info.headline}</p>
            <div className={s.heroDivider}/>
            <div className={s.heroMeta}>
              <div className={s.heroDate}>
                <span className={s.dateMonth}>{date.month}</span>
                <strong>{date.day}</strong>
                <span>{date.weekday}</span>
              </div>
              <div className={s.heroEventInfo}>
                <span><CalendarDays size={18}/>{niceDate(booking.eventDate)}</span>
                <span><Clock3 size={18}/>{schedule}</span>
                <span><MapPin size={18}/>{shown(booking.venue, 'Venue to be finalized')}</span>
              </div>
            </div>
          </div>
          <div className={s.heroVisual}>
            {packagePhoto ? /* eslint-disable-next-line @next/next/no-img-element */
              <img src={packagePhoto} alt={`${booking.package?.name || 'Event'} package`} className={s.heroPhoto} />
              : <div className={s.heroPlaceholder} aria-hidden="true"><Sparkles size={65} strokeWidth={1}/><span>Meaningful moments, thoughtfully planned.</span></div>}
            <div className={s.photoCaption}><span>SELECTED EXPERIENCE</span><strong>{booking.package?.name || 'Custom event planning'}</strong></div>
          </div>
        </div>

        <nav className={s.sectionNav} aria-label="Event detail sections">
          <a href="#event-overview">Event details</a>
          <a href="#event-package">Package</a>
          <a href="#event-styling">Styling & notes</a>
          <a href="#event-activity">Updates</a>
        </nav>

        {error && <div className={s.feedbackError} role="alert"><AlertCircle size={20}/><span>Could not refresh this booking: {error}</span><button onClick={() => void refresh()} type="button">Retry</button></div>}

        {feedback && <div role={feedback.success ? 'status' : 'alert'} className={`${s.feedback} ${feedback.success ? s.feedbackSuccess : s.feedbackError}`}>
          {feedback.success ? <CheckCircle2 size={27}/> : <AlertCircle size={27}/>}
          <div className={s.feedbackContent}>
            <strong>{feedback.success ? 'Your update was received' : 'Update not completed'}</strong>
            <p>{feedback.message}</p>
            {feedback.success && savedChanges.length > 0 && <ul>{savedChanges.map(change => <li key={change.label}><Check size={15}/><span>{change.label}: <strong>{change.after}</strong></span></li>)}</ul>}
          </div>
          <button type="button" onClick={() => { setFeedback(null); setSavedChanges([]); }} aria-label="Dismiss notification"><X size={18}/></button>
        </div>}

        <div className={s.contentGrid}>
          <div className={s.mainColumn}>
            <ContentSection id="event-overview" number="01" title="Your event, at a glance" subtitle="A clear snapshot of the details you've shared.">
              <div className={s.factGrid}>
                <Fact label="Event type" icon={<Sparkles size={19}/>}>{booking.eventType}</Fact>
                <Fact label="Expected guests" icon={<UsersRound size={19}/>}>{Number(booking.guestCount || 0).toLocaleString('en-PH')} guests</Fact>
                <Fact label="Event location" icon={<MapPin size={19}/>} wide>{shown(booking.venue, 'Not yet provided')}</Fact>
                <Fact label="Estimated budget" icon={<Wallet size={19}/>}>{shown(booking.estimatedBudget, 'Not specified')}</Fact>
                {booking.bookedValue !== null && booking.bookedValue !== undefined && <Fact label="Recorded booking value" icon={<ShieldCheck size={19}/>}>{php(booking.bookedValue) || 'Not recorded'}</Fact>}
              </div>
              <p className={s.finePrint}><Info size={16}/> Estimated budget and recorded booking value are not a payment confirmation or invoice.</p>
            </ContentSection>

            <ContentSection id="event-package" number="02" title="The experience you chose" subtitle="Your selected package and its published inclusions.">
              <div className={s.packageHeading}>
                <div><span className={s.labelCaps}>EVENT PACKAGE</span><h3>{booking.package?.name || 'Custom event request'}</h3></div>
                <span className={s.packageEmblem}><PackageIcon size={23}/></span>
              </div>
              {booking.package?.description && <p className={s.packageDescription}>{booking.package.description}</p>}
              {Array.isArray(booking.package?.inclusions) && booking.package.inclusions.length > 0
                ? <ul className={s.inclusionGrid}>{booking.package.inclusions.map((item, index) => <li key={`${index}-${item}`}><CheckCircle2 size={17}/>{item}</li>)}</ul>
                : <div className={s.emptyNote}>Our team can confirm the package inclusions with you in Messages.</div>}
            </ContentSection>

            <ContentSection id="event-styling" number="03" title="Your vision & details" subtitle="The creative direction and requests shared with the team."
              action={editable && <button type="button" onClick={editPreferences} aria-expanded={editing} className={s.editAction}><Pencil size={16}/>{editing ? 'Close editor' : 'Edit preferences'}</button>}>
              <div className={s.stylingGrid}>
                <div className={s.stylingTile}><span className={s.labelCaps}><Palette size={16}/> PREFERRED THEME</span><strong>{shown(booking.preferredTheme, 'Not chosen yet')}</strong></div>
                <div className={s.stylingTile}><span className={s.labelCaps}><Sparkles size={16}/> COLOR PALETTE</span><strong>{shown(booking.colorPalette, 'Not chosen yet')}</strong></div>
              </div>
              <div className={s.specialRequests}>
                <span className={s.labelCaps}><MessageSquareText size={16}/> SPECIAL REQUESTS</span>
                <p>{shown(booking.specialRequests, 'You haven’t added any special requests.')}</p>
              </div>
              {inspirationPhoto && <div className={s.inspiration}>
                <span className={s.labelCaps}><ImageIcon size={17}/> INSPIRATION PHOTO</span>
                <a href={inspirationPhoto} target="_blank" rel="noopener noreferrer" className={s.inspirationLink}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={inspirationPhoto} alt="Your event inspiration" loading="lazy"/>
                  <span>View inspiration image <ExternalLink size={16}/></span>
                </a>
              </div>}
              {editing && editable && <form className={s.editor} onSubmit={requestReview}>
                <div className={s.editorIntro}><Pencil size={20}/><div><h3>Refine your event vision</h3><p>You'll review every change before it is sent to DM Events.</p></div></div>
                <div className={s.fieldGrid}>
                  <label>Preferred theme<input type="text" maxLength={400} value={theme} onChange={event => setTheme(event.target.value)} placeholder="e.g. Garden elegance"/></label>
                  <label>Color palette<input type="text" maxLength={400} value={colors} onChange={event => setColors(event.target.value)} placeholder="e.g. Ivory, sage, gold"/></label>
                  <label className={s.fieldFull}>Special requests<textarea rows={4} maxLength={5000} value={requests} onChange={event => setRequests(event.target.value)} placeholder="Any other details you would like us to know?"/></label>
                </div>
                <div className={s.editorFooter}><span>{changes.length ? `${changes.length} unsaved change${changes.length === 1 ? '' : 's'}` : 'No unsaved changes'}</span>
                  <div><button type="button" disabled={busy} className={s.buttonGhost} onClick={editPreferences}>Discard</button>
                    <button type="submit" disabled={busy || !changes.length} className={s.buttonPrimary}>Review changes <ArrowRight size={17}/></button></div>
                </div>
              </form>}
            </ContentSection>

            <ContentSection id="event-activity" number="04" title="How your booking is progressing" subtitle="A record of status updates from the DM Events team.">
              {booking.history?.length ? <ol className={s.timeline} aria-label="Booking history">
                {booking.history.map(item => <li key={item.id} className={s.timelineItem}>
                  <span className={s.timelinePoint}><Check size={15}/></span>
                  <div className={s.timelineContent}><div className={s.timelineTop}><BookingStatus value={item.toStatus}/><time dateTime={item.createdAt}>{niceDate(item.createdAt)}</time></div>
                    <strong>{item.actorName || 'DM Events team'}</strong><p>{shown(item.note, 'Booking status updated')}</p></div>
                </li>)}
              </ol> : <div className={s.emptyNote}><Clock3 size={20}/> New updates will appear here after the team reviews your request.</div>}
              {booking.createdAt && <p className={s.createdAt}><CheckCircle2 size={17}/> Request submitted on {niceDate(booking.createdAt)}</p>}
            </ContentSection>
          </div>

          <aside className={s.sidebar} aria-label="Booking progress and support">
            <section className={s.progressCard}>
              <div className={s.progressHead}><span className={s.labelCaps}>BOOKING PROGRESS</span><BookingStatus value={booking.status}/></div>
              <h2>{info.headline}</h2><p>{info.explanation}</p>
              {booking.status === 'CANCELLED' ? <div className={s.cancelledNotice}><AlertCircle size={18}/> This booking is no longer active.</div>
                : <ol className={s.milestones}>{milestones.map((step, index) => <li key={step.title} className={`${s.milestone} ${info.stage >= index ? s.completed : ''} ${info.stage === index ? s.active : ''}`}>
                  <span className={s.milestoneMarker}>{info.stage >= index ? <Check size={16}/> : index + 1}</span>
                  <div><strong>{step.title}</strong><small>{step.detail}</small></div>
                </li>)}</ol>}
              <div className={s.nextStep}><strong><ClipboardList size={17}/> What's next?</strong><p>{info.next}</p></div>
            </section>

            <section className={s.helpCard}>
              <span className={s.helpIcon}><HeartHandshake size={30}/></span>
              <span className={s.labelCaps}>PERSONAL EVENT SUPPORT</span>
              <h2>Every great event begins with a conversation.</h2>
              <p>Your DM Events team is here for changes, questions and everything in between.</p>
              <Link href={`/client/messages?booking=${encodeURIComponent(id)}`} className={s.messageButton}><MessageCircle size={18}/> Message DM Events <ArrowRight size={18}/></Link>
            </section>

            {booking.reviewNote && <section className={s.sideCard}><h3><MessageSquareText size={20}/> A note from the team</h3><p className={s.reviewNote}>{booking.reviewNote}</p></section>}

            <section className={s.sideCard}>
              <h3><UsersRound size={20}/> Contact details</h3>
              <dl className={s.contactList}>
                <div><dt>Full name</dt><dd>{shown(booking.client?.fullName || booking.contactName)}</dd></div>
                <div><dt>Email</dt><dd>{shown(booking.client?.email || booking.contactEmail)}</dd></div>
                <div><dt>Phone</dt><dd>{shown(booking.client?.phone || booking.contactPhone)}</dd></div>
              </dl>
              <Link href="/client/profile" className={s.profileLink}>Edit your profile <ArrowRight size={15}/></Link>
            </section>

            <section className={s.sideCard}>
              <h3><ShieldCheck size={20}/> Cancellation request</h3>
              {booking.status === 'CANCELLED' ? <p className={s.cancelledNotice}><AlertCircle size={17}/> Booking cancelled.</p>
                : booking.cancellationRequestedAt ? <div className={s.pendingNotice}><AlertCircle size={17}/><div><strong>Awaiting team review</strong><p>Your booking stays {booking.status.toLowerCase()} until reviewed.</p>{booking.cancellationReason && <p>Reason: {booking.cancellationReason}</p>}</div></div>
                  : <>
                    <p className={s.sideIntro}>Need to change your plans? Request a review; your date won't be released automatically.</p>
                    <button type="button" className={s.cancelToggle} aria-expanded={cancelOpen} onClick={() => setCancelOpen(previous => !previous)}><ChevronDown size={17}/> {cancelOpen ? 'Close form' : 'Request cancellation'}</button>
                    {cancelOpen && <form className={s.cancelForm} onSubmit={submitCancellation}>
                      <label>Reason for cancellation<textarea required minLength={3} maxLength={2000} rows={4} value={cancelReason} onChange={event => setCancelReason(event.target.value)} placeholder="Tell us what has changed"/></label>
                      <p>Only the DM Events team can approve cancellation.</p>
                      <button type="submit" disabled={busy || cancelReason.trim().length < 3} className={s.buttonDanger}>{busy ? 'Submitting…' : 'Submit request'}</button>
                    </form>}
                  </>}
            </section>
          </aside>
        </div>
      </>}
      <BookingChangeDialog open={confirmChanges} reference={booking?.reference || ''} changes={changes} busy={busy}
        error={feedback?.success === false ? feedback.message : ''}
        onCancel={() => { if (!busy) setConfirmChanges(false); }} onConfirm={() => void savePreferences()}/>
    </div>
  </main>;
}
