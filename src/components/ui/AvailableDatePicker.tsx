'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react';
import { api } from '@/api-client/http';

type Reservation = { date: string; status: 'HELD' | 'CONFIRMED' };
type MonthResponse = { month: string; blockedDates: Reservation[] };
type Props = { id: string; value: string; onChange: (date: string) => void; label?: string; disabled?: boolean };
const todayInManila = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const monthNow = () => todayInManila().slice(0, 7);
const pad = (n: number) => String(n).padStart(2, '0');
function offsetMonth(month: string, change: number) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, number - 1 + change, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}
function friendlyDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-PH', {
    weekday: 'short', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** One picker shared by online and walk-in booking, using actual Supabase reservations. */
export default function AvailableDatePicker({ id, value, onChange, label = 'Preferred event date', disabled = false }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [opened, setOpened] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => value ? value.slice(0, 7) : monthNow());
  const [reservedDates, setReservedDates] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshIndex, setRefreshIndex] = useState(0);

  const close = useCallback(() => {
    dialog.current?.close();
    setOpened(false);
    trigger.current?.focus();
  }, []);
  const open = () => {
    if (disabled) return;
    setLoading(true); // Fail closed before the month request starts.
    setReservedDates([]);
    setFetchError('');
    setViewMonth(value ? value.slice(0, 7) : monthNow());
    setNotice('');
    setOpened(true);
  };

  useEffect(() => {
    if (opened && !dialog.current?.open) dialog.current?.showModal();
  }, [opened]);

  useEffect(() => {
    if (!opened) return;
    let active = true;
    setLoading(true);
    setFetchError('');
    setReservedDates([]);
    api<MonthResponse>(`/api/bookings/availability?month=${encodeURIComponent(viewMonth)}`)
      .then((data) => {
        if (!active) return;
        setReservedDates(data.blockedDates);
        if (value && value.startsWith(`${viewMonth}-`) && data.blockedDates.some(d => d.date === value)) {
          onChange('');
          setNotice('Your selected date has become unavailable. Please choose another.');
        }
      })
      .catch(() => { if (active) setFetchError('Unable to load availability. Try again before selecting a date.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Re-fetch when the month changes/opening the picker, not when a parent callback changes identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, viewMonth, refreshIndex]);

  useEffect(() => {
    if (!opened) return;
    const reload = () => setRefreshIndex(n => n + 1);
    const onVisibility = () => { if (document.visibilityState === 'visible') reload(); };
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [opened]);

  const [year, month] = viewMonth.split('-').map(Number);
  const daysCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const paddingDays = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const calendarDays = Array.from({ length: paddingDays + daysCount }, (_, i) => i < paddingDays ? null : i - paddingDays + 1);
  const today = todayInManila();
  const reservations = new Map(reservedDates.map(r => [r.date, r.status]));
  const monthLabel = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-[#263a4e]">{label}</label>
      <button id={id} type="button" ref={trigger} onClick={open} disabled={disabled}
        aria-haspopup="dialog" aria-expanded={opened}
        className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-[#cbd9e6] bg-white px-3 py-2.5 text-left text-sm shadow-sm transition hover:border-[#0b4d98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b4d98] disabled:opacity-50">
        <span className={`min-w-0 truncate ${value ? 'font-medium text-[#122c44]' : 'text-[#8294a5]'}`}>{value ? friendlyDate(value) : 'Choose an available date'}</span>
        <CalendarDays size={19} className="shrink-0 text-[#0b4d98]" aria-hidden="true" />
      </button>
      <p className="mt-1.5 text-xs leading-5 text-[#748498]">Held and confirmed dates are unavailable.</p>

      <dialog ref={dialog} onClose={() => setOpened(false)}
        onClick={e => { if (e.target === dialog.current) close(); }}
        aria-label="Choose an available event date"
        className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100vw-24px)] max-w-[425px] overflow-y-auto rounded-2xl border border-[#dae4ed] bg-white p-0 text-[#122c44] shadow-2xl backdrop:bg-[#071f3b]/55">
        <div className="border-b border-[#e1eaf1] bg-[#f3f8fc] px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#2762a6]">DM EVENTS</p>
              <p className="mt-1 text-lg font-semibold text-[#071f3b]">Choose your event date</p>
            </div>
            <button type="button" onClick={close} aria-label="Close calendar" className="flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-[#e4eef8]"><X size={20} /></button>
          </div>
          <p className="mt-2 text-xs leading-5 text-[#647b90]">Browse available dates for your event. Reservations are checked in real time.</p>
        </div>

        <div className="px-3 py-4 sm:px-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <button type="button" aria-label="Previous month" disabled={viewMonth <= monthNow()} onClick={() => { setLoading(true); setReservedDates([]); setViewMonth(offsetMonth(viewMonth, -1)); }}
              className="flex size-10 items-center justify-center rounded-lg border border-[#e1eaf1] hover:bg-[#f3f8fc] disabled:opacity-30"><ChevronLeft size={18}/></button>
            <span className="text-base font-semibold text-[#071f3b]">{monthLabel}</span>
            <button type="button" aria-label="Next month" onClick={() => { setLoading(true); setReservedDates([]); setViewMonth(offsetMonth(viewMonth, 1)); }}
              className="flex size-10 items-center justify-center rounded-lg border border-[#e1eaf1] hover:bg-[#f3f8fc]"><ChevronRight size={18}/></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center" aria-label={monthLabel}>
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <span key={d} className="py-2 text-[11px] font-semibold text-[#75889b]">{d}</span>)}
            {calendarDays.map((day, index) => {
              if (day === null) return <span key={`pad-${index}`} aria-hidden="true" />;
              const iso = `${viewMonth}-${pad(day)}`;
              const status = reservations.get(iso);
              const isPast = iso < today;
              const selected = iso === value;
              const unavailable = Boolean(status) || isPast || loading || Boolean(fetchError);
              const state = status === 'CONFIRMED' ? 'Confirmed' : status === 'HELD' ? 'Held' : isPast ? 'Past' : 'Available';
              return <button key={iso} type="button" disabled={unavailable}
                aria-pressed={selected} aria-label={`${friendlyDate(iso)}, ${state}`}
                title={`${friendlyDate(iso)} — ${state}`}
                onClick={() => { onChange(iso); close(); }}
                className={[
                  'relative flex aspect-square min-h-10 min-w-0 items-center justify-center rounded-lg border text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-[#0b4d98]',
                  selected ? 'border-[#0b4d98] bg-[#0b4d98] text-white' :
                  status === 'CONFIRMED' ? 'cursor-not-allowed border-red-200 bg-red-50 text-red-700 line-through' :
                  status === 'HELD' ? 'cursor-not-allowed border-amber-200 bg-amber-50 text-amber-800 line-through' :
                  isPast ? 'cursor-not-allowed border-transparent bg-[#f3f5f7] text-[#a7b1bc]' :
                  'border-[#e2eaf2] bg-white text-[#17324c] hover:border-[#0b4d98] hover:bg-[#edf5ff]',
                ].join(' ')}>
                {day}
                {iso === today && !selected && <span aria-hidden="true" className="absolute bottom-1 size-1 rounded-full bg-[#0b4d98]" />}
                {selected && <Check size={11} className="absolute right-1 top-1" aria-hidden="true" />}
              </button>;
            })}
          </div>
          {loading && <p className="mt-4 text-center text-xs text-[#647b90]" role="status">Checking availability…</p>}
          {fetchError && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{fetchError}</p>}
          {notice && <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="status">{notice}</p>}
          <div className="mt-5 grid grid-cols-3 gap-2 border-t border-[#e1eaf1] pt-4 text-[11px] text-[#49667c]">
            <span className="flex flex-wrap items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#2d967c]"/>Available</span>
            <span className="flex flex-wrap items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#e6aa42]"/>Held</span>
            <span className="flex flex-wrap items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#db5265]"/>Confirmed</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => { setLoading(true); setReservedDates([]); setRefreshIndex(n => n + 1); }} className="inline-flex items-center gap-1.5 rounded-md px-2 py-2 text-xs font-semibold text-[#0b4d98] hover:bg-[#edf5ff]"><RefreshCw size={14}/> Refresh dates</button>
            <button type="button" onClick={close} className="rounded-md border border-[#dae4ed] px-3 py-2 text-xs font-semibold text-[#263d58] hover:bg-[#f3f8fc]">Close</button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
