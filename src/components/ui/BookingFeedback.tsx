'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, ClipboardCheck, FileCheck2, MessageCircle, PartyPopper, ShieldCheck, Sparkles } from 'lucide-react';
import type { BookingChange } from './BookingChangeDialog';
import { BookingStatus, bookingStyles as s } from './BookingSurface';

export function BookingSavedDialog({ open, reference, changes, onContinue, canReturnToList }: {
  open: boolean; reference: string; changes: BookingChange[]; onContinue: () => void; canReturnToList: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) { if (!dialog.open) dialog.showModal(); buttonRef.current?.focus(); }
    else if (dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={dialogRef} aria-labelledby="booking-saved-title" aria-describedby="booking-saved-description"
    onCancel={event => { event.preventDefault(); onContinue(); }}
    className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100vw-28px)] max-w-lg overflow-y-auto rounded-[22px] border border-[#dce7ef] bg-white p-0 text-[#18324a] shadow-[0_28px_90px_rgba(6,28,50,.27)] backdrop:bg-[#081e34]/75">
    <div className="relative overflow-hidden bg-gradient-to-br from-[#0c2a41] via-[#154764] to-[#285c76] px-6 pb-8 pt-9 text-center text-white sm:px-9">
      <div className="pointer-events-none absolute -right-14 -top-24 size-64 rounded-full border border-[#ebd19a]/25"/>
      <div className="relative mx-auto mb-5 grid size-[76px] place-items-center rounded-full bg-white/10 ring-1 ring-white/25">
        <CheckCircle2 size={43} className="text-[#eace94] motion-safe:animate-[bounce_700ms_ease-out_1]" strokeWidth={1.5}/>
      </div>
      <span className="relative text-[10px] font-bold uppercase tracking-[.22em] text-[#e4ca9b]">Update completed</span>
      <h2 id="booking-saved-title" className="relative !mt-3 !font-serif !text-3xl !font-normal !text-white">Changes saved</h2>
      <p id="booking-saved-description" className="relative mt-2 text-sm leading-6 text-[#d6e3eb]">Your updates to booking <strong className="text-white">{reference}</strong> have been saved successfully.</p>
    </div>
    <div className="px-6 pb-7 pt-6 sm:px-8">
      {changes.length > 0 && <div className="rounded-xl border border-[#e5edf2] bg-[#f8fbfd] p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold text-[#305c79]"><FileCheck2 size={16}/>{changes.length} {changes.length === 1 ? 'change' : 'changes'} saved</div>
        <ul className="space-y-3">{changes.map(change => <li key={change.label} className="min-w-0 border-t border-[#e3ebf1] pt-3 first:border-0 first:pt-0"><span className="block text-[11px] font-semibold text-[#748b9c]">{change.label}</span><span className="mt-1 block break-words whitespace-pre-wrap text-sm font-semibold text-[#1b475f]">{change.after || 'Not set'}</span></li>)}</ul>
      </div>}
      <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#73899a]"><ShieldCheck size={15} className="mt-0.5 shrink-0"/>{canReturnToList ? 'Choose OK to return to the booking list.' : 'Choose OK to stay in the booking details.'}</p>
      <button ref={buttonRef} type="button" className={`${s.actionLink} mt-6 w-full`} onClick={onContinue}>OK <ArrowRight size={16}/></button>
    </div>
  </dialog>;
}

export function BookingSuccessCard({ reference, title, message, viewHref, messageHref, onNew, status = 'TENTATIVE' }: {
  reference: string; title: string; message: string; viewHref: string; messageHref?: string; onNew?: () => void; status?: string;
}) {
  return <section className="mx-auto w-full max-w-[790px] overflow-hidden rounded-[23px] border border-[#dce6ef] bg-white shadow-[0_22px_60px_rgba(12,42,65,.1)]">
    <div className="relative overflow-hidden bg-gradient-to-br from-[#0b2136] via-[#144260] to-[#29617d] px-6 pb-10 pt-11 text-center sm:px-12 sm:pt-14">
      <div className="pointer-events-none absolute -right-20 -top-28 size-80 rounded-full border border-[#e4ca9b]/30"/>
      <div className="relative mx-auto mb-6 grid size-[88px] place-items-center rounded-full border border-[#f0d59c]/40 bg-white/10">
        <CheckCircle2 size={48} strokeWidth={1.5} className="text-[#f0d59c] motion-safe:animate-[bounce_750ms_ease-out_1]"/>
      </div>
      <span className="relative inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.2em] text-[#eacb93]"><Sparkles size={14}/> Request received</span>
      <h1 className="relative mt-4 font-serif text-[clamp(28px,4vw,42px)] font-normal leading-tight text-white">{title}</h1>
      <p className="relative mx-auto mt-3 max-w-xl text-sm leading-7 text-[#d3e1ea]">{message}</p>
    </div>
    <div className="px-6 py-8 sm:px-10">
      <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-[#e4ecf2] bg-[#f7fafc] p-5 sm:flex-row sm:items-center">
        <div><span className="block text-[10px] font-extrabold uppercase tracking-[.12em] text-[#7790a2]">Your booking reference</span><strong className="mt-2 block break-all text-lg font-extrabold tracking-wide text-[#163d5b]">{reference}</strong></div>
        <BookingStatus value={status}/>
      </div>
      <div className="mt-6 flex gap-3 rounded-xl border border-[#d2e6f4] bg-[#f0f7fc] p-4 text-sm leading-6 text-[#2f5f7d]"><ClipboardCheck size={21} className="mt-0.5 shrink-0"/><p>{status === 'TENTATIVE' ? 'This request is an inquiry, not a confirmed reservation. DM Events will review the preferred date and event details before confirming.' : status === 'HELD' ? 'This booking is currently held while the team finalizes the event details.' : status === 'CONFIRMED' ? 'This booking has been confirmed. Your event details and coordination updates are available in your booking.' : 'This booking has been cancelled. Contact the team if you need assistance.'}</p></div>
      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <Link className={s.actionLink} href={viewHref}><FileCheck2 size={17}/> View booking <ArrowRight size={16}/></Link>
        {messageHref ? <Link className={`${s.actionLink} ${s.actionLinkSecondary}`} href={messageHref}><MessageCircle size={17}/> Message DM Events</Link> : onNew ? <button type="button" className={`${s.actionLink} ${s.actionLinkSecondary}`} onClick={onNew}><PartyPopper size={17}/> New walk-in inquiry</button> : <Link className={`${s.actionLink} ${s.actionLinkSecondary}`} href="/client/bookings">All my bookings</Link>}
      </div>
      <p className="mt-6 text-center text-xs leading-6 text-[#8a9baa]">Save your reference number for future follow-ups.</p>
    </div>
  </section>;
}
