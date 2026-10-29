'use client';

import { useEffect, useRef } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardCheck, ShieldCheck, X } from 'lucide-react';

export type BookingChange = { label: string; before: string; after: string };

type Props = {
  open: boolean;
  reference: string;
  changes: BookingChange[];
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Used for employee booking updates, event scheduling and client preference changes. */
export default function BookingChangeDialog({ open, reference, changes, busy, error, onCancel, onConfirm }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) { if (!dialog.open) dialog.showModal(); confirmRef.current?.focus(); }
    else if (dialog.open) dialog.close();
  }, [open]);

  return <dialog
    ref={dialogRef} aria-labelledby="booking-confirm-title" aria-describedby="booking-confirm-description"
    onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}
    onClick={event => { if (event.target === dialogRef.current && !busy) onCancel(); }}
    className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100vw-28px)] max-w-[650px] overflow-y-auto rounded-[22px] border border-[#d9e4ec] bg-white p-0 text-[#18324a] shadow-[0_28px_90px_rgba(6,28,50,.27)] backdrop:bg-[#081e34]/75">
    <div className="relative overflow-hidden bg-gradient-to-r from-[#0b273e] to-[#19506d] px-6 pb-6 pt-7 text-white sm:px-8">
      <div className="pointer-events-none absolute -right-12 -top-20 size-56 rounded-full border border-[#e6ca97]/25"/>
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-[#edd3a0]"><ClipboardCheck size={15}/> Final review</span>
          <h2 id="booking-confirm-title" className="!mb-0 !mt-3 !font-serif !text-[clamp(24px,4vw,30px)] !font-normal !leading-tight !text-white">Review booking changes</h2>
          <p id="booking-confirm-description" className="mt-2 break-words text-xs leading-6 text-[#d6e4ee]">Booking {reference} · Verify the details below before saving.</p>
        </div>
        <button type="button" aria-label="Close confirmation" disabled={busy} onClick={onCancel} className="rounded-lg border border-white/20 p-2 hover:bg-white/10 disabled:opacity-50"><X size={19}/></button>
      </div>
    </div>
    <div className="px-6 pb-7 pt-6 sm:px-8">
      <div className="mb-5 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-bold text-[#355d78]"><CheckCircle2 size={17}/>{changes.length} {changes.length === 1 ? 'change' : 'changes'} to apply</span><span className="rounded-full bg-[#f1f6f9] px-3 py-1 text-[10px] font-bold text-[#638299]">Before → After</span></div>
      <dl className="max-h-[48dvh] space-y-3 overflow-y-auto pr-1">
        {changes.map(change => <div key={change.label} className="min-w-0 rounded-xl border border-[#e1eaf0] bg-[#f9fbfd] px-4 py-4">
          <dt className="mb-3 text-xs font-extrabold text-[#214b66]">{change.label}</dt>
          <dd className="grid min-w-0 grid-cols-1 items-start gap-3 text-sm sm:grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)]">
            <div className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-[.08em] text-[#9aa8b4]">Before</span><p className="mt-1 break-words whitespace-pre-wrap text-[#697d8c] [overflow-wrap:anywhere]">{change.before || 'Not set'}</p></div>
            <ArrowRight size={17} className="mt-4 hidden shrink-0 text-[#8da5b5] sm:block" aria-hidden="true"/>
            <div className="min-w-0 rounded-lg border border-[#d9e9f2] bg-white p-2 sm:p-0 sm:border-0 sm:bg-transparent"><span className="block text-[10px] font-bold uppercase tracking-[.08em] text-[#467693]">After</span><p className="mt-1 break-words whitespace-pre-wrap font-bold text-[#16466b] [overflow-wrap:anywhere]">{change.after || 'Not set'}</p></div>
          </dd>
        </div>)}
      </dl>
      {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert"><AlertCircle size={17} className="shrink-0"/>{error}</div>}
      <p className="mt-5 flex items-start gap-2 text-[11px] leading-6 text-[#7a90a0]"><ShieldCheck size={16} className="mt-1 shrink-0"/>Changes are sent only after confirmation. Server-side role, date reservation and booking validation rules still apply.</p>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" className="btn btn-ghost w-full sm:w-auto" onClick={onCancel} disabled={busy}>Back to editing</button>
        <button type="button" className="btn w-full sm:w-auto" ref={confirmRef} onClick={onConfirm} disabled={busy || changes.length === 0}>{busy ? 'Saving changes…' : 'Confirm & save'} <ArrowRight size={16}/></button>
      </div>
    </div>
  </dialog>;
}
