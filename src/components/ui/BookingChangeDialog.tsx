'use client';

import { useEffect, useRef } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, X } from 'lucide-react';

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

/** Shared by employee booking reviews (including walk-ins) and client preference edits. */
export default function BookingChangeDialog({ open, reference, changes, busy, error, onCancel, onConfirm }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      confirmRef.current?.focus();
    } else if (dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="booking-confirm-title"
      aria-describedby="booking-confirm-description"
      onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}
      onClick={event => { if (event.target === dialogRef.current && !busy) onCancel(); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100vw-28px)] max-w-xl overflow-y-auto rounded-2xl border border-[#dae4ed] bg-white p-0 text-[#122c44] shadow-2xl backdrop:bg-[#071f3b]/70"
    >
      <div className="flex items-start justify-between gap-3 border-b border-[#dae4ed] bg-[#f1f6fa] p-5 sm:p-6">
        <div className="min-w-0">
          <div className="mb-2 inline-flex size-11 items-center justify-center rounded-full bg-[#deecfb] text-[#0b4d98]"><CheckCircle2 size={22} aria-hidden="true" /></div>
          <h2 id="booking-confirm-title" className="!m-0 !font-sans !text-xl !font-semibold !leading-7">Confirm booking changes</h2>
          <p id="booking-confirm-description" className="mt-2 break-all text-sm text-[#647b90]">{reference} — Review every change before saving.</p>
        </div>
        <button type="button" disabled={busy} onClick={onCancel} aria-label="Close confirmation" className="rounded-lg p-2 hover:bg-[#e2ebf4] disabled:opacity-50"><X size={20} /></button>
      </div>
      <div className="p-5 sm:p-6">
        <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#263a4e]"><AlertCircle size={17} className="text-[#0b4d98]" /> {changes.length} {changes.length === 1 ? 'field' : 'fields'} changed</p>
        <dl className="max-h-[48dvh] space-y-3 overflow-y-auto pr-1">
          {changes.map(change => (
            <div key={change.label} className="min-w-0 rounded-xl border border-[#e0e8f0] bg-[#f8fbfe] p-3 sm:p-4">
              <dt className="mb-3 text-sm font-semibold text-[#122c44]">{change.label}</dt>
              <dd className="grid min-w-0 grid-cols-1 gap-3 text-sm sm:grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)] sm:items-start">
                <div className="min-w-0"><span className="block text-xs font-medium text-[#748498]">Before</span><p className="mt-1 break-words whitespace-pre-wrap text-[#6f7e8b] [overflow-wrap:anywhere]">{change.before || '—'}</p></div>
                <ArrowRight size={17} className="hidden shrink-0 text-[#0b4d98] sm:mt-5 sm:block" aria-hidden="true" />
                <div className="min-w-0"><span className="block text-xs font-medium text-[#748498]">After</span><p className="mt-1 break-words whitespace-pre-wrap font-semibold text-[#0b4d98] [overflow-wrap:anywhere]">{change.after || '—'}</p></div>
              </dd>
            </div>
          ))}
        </dl>
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <p className="mt-4 text-xs leading-5 text-[#748498]">The booking will only be updated after you confirm. Existing date-conflict and permission checks remain enforced by the server.</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-ghost w-full sm:w-auto" onClick={onCancel} disabled={busy}>Back to editing</button>
          <button type="button" className="btn w-full sm:w-auto" ref={confirmRef} onClick={onConfirm} disabled={busy || changes.length === 0}>{busy ? 'Saving changes…' : 'Confirm & save'}</button>
        </div>
      </div>
    </dialog>
  );
}
