import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CalendarDays, Check, CircleDot, Clock3, FileText, Inbox, Search, Sparkles } from 'lucide-react';
import { niceDate } from '@/components/ui/Blocks';
import styles from './BookingSurface.module.css';

export { styles as bookingStyles };

export type BookingStatusValue = 'TENTATIVE' | 'HELD' | 'CONFIRMED' | 'CANCELLED' | string;
export type BookingInfo = { label: string; value: string | number | null | undefined };
export type HistoryEntry = { id: string; toStatus: string; note: string | null; actorName: string | null; createdAt: string };

const statusDescription: Record<string, string> = {
  TENTATIVE: 'Awaiting review', HELD: 'Date temporarily reserved',
  CONFIRMED: 'Event confirmed', CANCELLED: 'Booking cancelled',
};

export function BookingStatus({ value }: { value: BookingStatusValue }) {
  const classes: Record<string, string> = {
    TENTATIVE: styles.tentative, HELD: styles.held,
    CONFIRMED: styles.confirmed, CANCELLED: styles.cancelled,
  };
  return <span className={`${styles.pill} ${classes[value] || styles.tentative}`} title={statusDescription[value] || value}>
    {value === 'CONFIRMED' ? <Check size={12} /> : <CircleDot size={11} />}
    {value.charAt(0) + value.slice(1).toLowerCase()}
  </span>;
}

export function BookingHero({ eyebrow, title, description, actions, backHref, backLabel, children }: {
  eyebrow: string; title: string; description: string; actions?: ReactNode;
  backHref?: string; backLabel?: string; children?: ReactNode;
}) {
  return <header className={styles.hero}>
    {backHref && <Link className={styles.breadcrumb} href={backHref}><ArrowLeft size={14}/>{backLabel || 'Back to bookings'}</Link>}
    <div className={styles.heroInner}>
      <div className="min-w-0 flex-1">
        <span className={styles.eyebrow}><Sparkles size={14}/>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className={styles.heroActions}>{actions}</div>}
    </div>
    {children}
  </header>;
}

export function BookingSummary({ items }: { items: { label: string; value: string | number; note?: string; icon?: ReactNode }[] }) {
  return <div className={styles.summaryGrid}>
    {items.map(item => <div className={styles.summary} key={item.label}>
      {item.icon && <span className={styles.summaryIcon}>{item.icon}</span>}
      <span className={styles.summaryCaption}>{item.label}</span>
      <strong className={styles.summaryValue}>{item.value}</strong>
      {item.note && <span className={styles.summaryNote}>{item.note}</span>}
    </div>)}
  </div>;
}

export function BookingPanel({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return <section className={styles.panel}>
    <div className={styles.panelHead}><div className="min-w-0"><h2>{title}</h2>{description && <p>{description}</p>}</div>{actions}</div>
    <div className={styles.panelBody}>{children}</div>
  </section>;
}

export function BookingInfoGrid({ items }: { items: BookingInfo[] }) {
  return <dl className={styles.infoGrid}>
    {items.map(item => <div className={styles.infoItem} key={item.label}>
      <dt className={styles.infoLabel}><FileText size={12}/>{item.label}</dt>
      <dd className={styles.infoValue}>{item.value === null || item.value === undefined || String(item.value).trim() === '' ? 'Not provided' : item.value}</dd>
    </div>)}
  </dl>;
}

export function BookingTimeline({ history }: { history: HistoryEntry[] }) {
  if (!history.length) return <BookingEmpty title="No status changes yet" description="Event updates will appear here as your booking progresses." />;
  return <ol className={styles.timeline} aria-label="Booking activity history">
    {history.map(item => <li key={item.id} className={styles.timelineItem}>
      <div className={styles.timelineRail}><span className={styles.timelineDot}><Clock3 size={12}/></span></div>
      <div className={styles.timelineContent}>
        <div className={styles.timelineTop}><BookingStatus value={item.toStatus}/><time className={styles.timelineDate} dateTime={item.createdAt}>{niceDate(item.createdAt)}</time></div>
        <div className={styles.timelineActor}>{item.actorName || 'DM Events'}</div>
        <div className={styles.timelineNote}>{item.note || 'Status updated'}</div>
      </div>
    </li>)}
  </ol>;
}

export function BookingEmpty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className={styles.empty}><span className={styles.emptyIcon}><Inbox size={26}/></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function BookingSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <div className={styles.search}><Search size={17} className={styles.searchIcon}/><input className={styles.input} aria-label={placeholder} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder}/></div>;
}

export function BookingRecord({ href, reference, title, subTitle, date, status, source, cancellationRequested }: {
  href: string; reference: string; title: string; subTitle?: string; date: string; status: string; source?: string; cancellationRequested?: boolean;
}) {
  return <article className={styles.record}>
    <div className={styles.recordMain}>
      <div className={styles.recordTop}><span className={styles.recordRef}>{reference}</span><BookingStatus value={status}/>{source === 'WALK_IN' && <span className={styles.muted}>Walk-in</span>}</div>
      <h3>{title}</h3>
      <div className={styles.recordMeta}><span><CalendarDays size={14}/>{niceDate(date)}</span>{subTitle && <span><FileText size={14}/>{subTitle}</span>}{cancellationRequested && <span className={styles.attention}>Cancellation requested</span>}</div>
    </div>
    <div className={styles.recordSide}>
      <span className={styles.muted}>{statusDescription[status] || 'View details'}</span>
      <Link className={styles.recordAction} href={href} aria-label={`View booking ${reference}`}>View details <ArrowRight size={16}/></Link>
    </div>
  </article>;
}
