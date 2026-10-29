'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react';
import { api } from '@/api-client/http';

type Reservation = { date: string; status: 'HELD' | 'CONFIRMED' };
type MonthResponse = { month: string; blockedDates: Reservation[] };
type Props = {
  id: string;
  value: string;
  onChange: (date: string) => void;
  label?: string;
  disabled?: boolean;
  /** `inline` embeds the same live-availability calendar in a booking form card. */
  display?: 'inline' | 'modal';
};

const todayInManila = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const pad = (n: number) => String(n).padStart(2, '0');
const currentMonth = () => todayInManila().slice(0, 7);
function shiftMonth(month: string, offset: number) {
  const [year, number] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, number - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`;
}
function formatDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

/**
 * Both Client and Walk-in bookings use the same status-aware calendar.
 * Availability is informational; the POST API remains the final authority.
 */
export default function AvailableDatePicker({
  id, value, onChange, label = 'Preferred event date', disabled = false, display = 'modal',
}: Props) {
  const inline = display === 'inline';
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [opened, setOpened] = useState(false);
  const [month, setMonth] = useState(() => value ? value.slice(0, 7) : currentMonth());
  const [blocked, setBlocked] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const visible = inline || opened;

  const close = useCallback(() => {
    dialog.current?.close();
    setOpened(false);
    trigger.current?.focus();
  }, []);
  const open = () => {
    if (disabled) return;
    setMonth(value ? value.slice(0, 7) : currentMonth());
    setLoading(true);
    setBlocked([]);
    setNotice('');
    setOpened(true);
  };

  useEffect(() => {
    if (!inline && opened && !dialog.current?.open) dialog.current?.showModal();
  }, [opened, inline]);

  useEffect(() => {
    if (!visible || disabled) return;
    const controller = new AbortController();
    setLoading(true);
    setBlocked([]);
    setFetchError('');
    void api<MonthResponse>(`/api/bookings/availability?month=${encodeURIComponent(month)}`, {
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return;
      setBlocked(result.blockedDates);
      if (value && value.startsWith(`${month}-`) && result.blockedDates.some(item => item.date === value)) {
        onChange('');
        setNotice('Your previously selected date is now unavailable. Choose another date.');
      }
    }).catch(() => {
      if (!controller.signal.aborted) setFetchError('Could not load reserved dates. Please refresh the calendar.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
    // Only refresh when opening, changing months or explicitly refreshing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, disabled, month, refresh]);

  useEffect(() => {
    if (!visible) return;
    const reload = () => setRefresh(value => value + 1);
    const onVisibility = () => { if (document.visibilityState === 'visible') reload(); };
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [visible]);

  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const dayOffset = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const days = Array.from({ length: dayOffset + daysInMonth }, (_, index) => index < dayOffset ? null : index - dayOffset + 1);
  const today = todayInManila();
  const reserved = new Map<string, Reservation['status']>(blocked.map(item => [item.date, item.status]));
  const title = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)));

  const calendar = (
    <div className="min-w-0 p-4 sm:p-6" aria-busy={loading}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <button type="button" aria-label="Previous month" disabled={month <= currentMonth() || disabled}
          onClick={() => { setMonth(current => shiftMonth(current, -1)); setLoading(true); }}
          className="flex size-11 items-center justify-center rounded-xl border border-[#d9e3ed] bg-white text-[#1b3d5e] transition hover:border-[#0b4d98] disabled:opacity-30">
          <ChevronLeft size={19} />
        </button>
        <div className="text-center"><p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#a18b59]">EVENT CALENDAR</p><h3 className="mt-1 text-base font-bold text-[#102d48] sm:text-lg">{title}</h3></div>
        <button type="button" aria-label="Next month" disabled={disabled}
          onClick={() => { setMonth(current => shiftMonth(current, 1)); setLoading(true); }}
          className="flex size-11 items-center justify-center rounded-xl border border-[#d9e3ed] bg-white text-[#1b3d5e] transition hover:border-[#0b4d98] disabled:opacity-30">
          <ChevronRight size={19} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center sm:gap-2" aria-label={title}>
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <span key={day} className="py-2 text-xs font-semibold text-[#6d8196]">{day}</span>)}
        {loading ? Array.from({ length: 35 }, (_, index) => <span key={index} className="aspect-square min-h-10 animate-pulse rounded-xl bg-[#e6edf4]" aria-hidden="true" />) : days.map((day, index) => {
          if (day === null) return <span key={`padding-${index}`} aria-hidden="true" />;
          const iso = `${month}-${pad(day)}`;
          const status = reserved.get(iso);
          const past = iso < today;
          const selected = value === iso;
          const unavailable = !!status || past || !!fetchError || disabled;
          const state = status === 'CONFIRMED' ? 'Confirmed' : status === 'HELD' ? 'Held' : past ? 'Past date' : 'Available';
          return (
            <button key={iso} type="button" aria-pressed={selected} aria-label={`${formatDate(iso)} — ${state}`}
              title={`${formatDate(iso)} — ${state}`} disabled={unavailable}
              onClick={() => { onChange(iso); setNotice(''); if (!inline) close(); }}
              className={[
                'relative flex aspect-square min-h-10 min-w-0 items-center justify-center rounded-xl border text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b4d98] sm:text-base',
                selected && !unavailable ? 'border-[#0b4d98] bg-[#0b4d98] text-white shadow-md' :
                status === 'CONFIRMED' ? 'cursor-not-allowed border-red-200 bg-red-50 text-red-700 line-through' :
                status === 'HELD' ? 'cursor-not-allowed border-amber-200 bg-amber-50 text-amber-800 line-through' :
                past ? 'cursor-not-allowed border-transparent bg-[#f1f4f7] text-[#a5b1bd]' :
                unavailable ? 'cursor-not-allowed border-[#e8ebef] bg-[#f7f8fa] text-[#8594a3]' :
                'border-[#e1e8f0] bg-white text-[#17324c] hover:border-[#0b4d98] hover:bg-[#edf5ff]',
              ].join(' ')}>
              {day}
              {iso === today && !selected && !unavailable && <span aria-hidden="true" className="absolute bottom-1 size-1 rounded-full bg-[#0b4d98]" />}
              {selected && !unavailable && <Check size={12} className="absolute right-1 top-1" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      {loading && <p className="mt-4 text-center text-sm text-[#647b90]" role="status">Checking available dates…</p>}
      {fetchError && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{fetchError}</p>}
      {notice && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">{notice}</p>}
      <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-[#e4eaf0] pt-4 text-xs text-[#425b72]">
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#2d967c]" />Available</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#e6aa42]" />Held</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#db5265]" />Confirmed</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button type="button" disabled={disabled} onClick={() => { setLoading(true); setRefresh(n => n + 1); }}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-[#0b4d98] hover:bg-[#edf5ff]"><RefreshCw size={15} />Refresh availability</button>
        {!inline && <button type="button" onClick={close} className="rounded-lg border border-[#dae4ed] px-4 py-2 text-sm font-semibold text-[#263d58]">Close</button>}
      </div>
    </div>
  );

  if (inline) {
    return (
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-sm font-bold text-[#17324c]">{label}</p><p className="mt-1 text-xs text-[#748498]">Held and Confirmed dates cannot be selected.</p></div>
          {value && <span className="rounded-lg bg-[#e8f3ee] px-3 py-2 text-xs font-bold text-[#1a7055]">{formatDate(value)}</span>}
        </div>
        <div className="overflow-hidden rounded-2xl border border-[#dfe7ee] bg-[#fbfcfe] shadow-sm">{calendar}</div>
        {!value && <p className="mt-3 text-xs text-[#748498]">Select an available date above to continue.</p>}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-[#263a4e]">{label}</label>
      <button id={id} type="button" ref={trigger} onClick={open} disabled={disabled} aria-haspopup="dialog" aria-expanded={opened}
        className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-[#cbd9e6] bg-white px-3 py-2.5 text-left text-sm shadow-sm transition hover:border-[#0b4d98] disabled:opacity-50">
        <span className={`min-w-0 truncate ${value ? 'font-medium text-[#122c44]' : 'text-[#8294a5]'}`}>{value ? formatDate(value) : 'Choose an available date'}</span>
        <CalendarDays size={19} className="shrink-0 text-[#0b4d98]" aria-hidden="true" />
      </button>
      <p className="mt-1.5 text-xs text-[#748498]">Held and confirmed dates are unavailable.</p>
      <dialog ref={dialog} onClose={() => setOpened(false)}
        onClick={event => { if (event.target === dialog.current) close(); }}
        aria-label="Choose an available event date"
        className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100vw-24px)] max-w-[460px] overflow-y-auto rounded-2xl border border-[#dae4ed] bg-white p-0 text-[#122c44] shadow-2xl backdrop:bg-[#071f3b]/55">
        <div className="flex items-center justify-between gap-3 border-b border-[#e1eaf1] bg-[#f3f8fc] px-5 py-4">
          <div><p className="text-xs font-bold uppercase tracking-[.15em] text-[#2762a6]">DM EVENTS</p><p className="mt-1 text-lg font-semibold">Choose your event date</p></div>
          <button type="button" onClick={close} aria-label="Close calendar" className="rounded-lg p-2 hover:bg-[#e4eef8]"><X size={20} /></button>
        </div>
        {calendar}
      </dialog>
    </div>
  );
}
