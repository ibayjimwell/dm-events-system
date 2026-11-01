'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Exit = {kind:'link';href:string} | {kind:'back'};
/**
 * Warns before losing an edited booking. Browser reload/close is guarded by the
 * native beforeunload prompt (custom modals cannot be shown during unload).
 * Next.js Link clicks are caught in capture, before the router navigates.
 */
export default function useUnsavedChangesGuard(dirty: boolean) {
  const router = useRouter();
  const [destination,setDestination] = useState<Exit | null>(null);
  const dirtyRef = useRef(dirty);
  const allowRef = useRef(false);
  useEffect(()=>{dirtyRef.current=dirty;},[dirty]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (allowRef.current || !dirtyRef.current) return;
      event.preventDefault(); event.returnValue = '';
    };
    const onClick = (event: MouseEvent) => {
      if (!dirtyRef.current || allowRef.current || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const target = new URL(anchor.href,location.href);
      if (target.origin !== location.origin) return; // external navigation uses native beforeunload
      if (target.pathname === location.pathname && target.search === location.search) return;
      event.preventDefault(); event.stopImmediatePropagation(); event.stopPropagation();
      setDestination({kind:'link',href:target.pathname+target.search+target.hash});
    };
    // This extra same-page entry catches browser back while unsaved edits exist.
    const guardId = `dm-booking-edit-${Date.now()}`;
    window.history.pushState({...window.history.state,dmEditGuard:guardId},'',location.href);
    const onPopState = () => {
      if (!dirtyRef.current || allowRef.current) return;
      window.history.pushState({...window.history.state,dmEditGuard:guardId},'',location.href);
      setDestination({kind:'back'});
    };
    window.addEventListener('beforeunload',beforeUnload);
    document.addEventListener('click',onClick,true);
    window.addEventListener('popstate',onPopState);
    return () => {
      window.removeEventListener('beforeunload',beforeUnload);
      document.removeEventListener('click',onClick,true);
      window.removeEventListener('popstate',onPopState);
    };
  },[dirty]);
  const proceed = () => {
    if (!destination) return;
    allowRef.current=true;
    setDestination(null);
    if (destination.kind === 'back') window.history.go(-2);
    else router.push(destination.href);
  };
  const dialog = destination ? <div className="fixed inset-0 z-[250] flex items-center justify-center bg-[#071f3b]/75 p-4" role="dialog" aria-modal="true" aria-labelledby="booking-exit-title">
    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
      <div className="flex justify-between gap-4"><span className="flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><AlertTriangle size={22}/></span><button type="button" aria-label="Stay on booking" onClick={()=>setDestination(null)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><X size={19}/></button></div>
      <h2 id="booking-exit-title" className="mt-4 text-xl font-bold text-[#143a56]">Leave without saving?</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">You have unsaved changes to this booking. Leaving now will discard those edits.</p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={()=>setDestination(null)} className="rounded-xl border border-slate-300 px-4 py-2.5 font-semibold text-slate-700">Keep editing</button><button type="button" onClick={proceed} className="rounded-xl bg-[#a02b3b] px-4 py-2.5 font-semibold text-white">Discard changes & leave</button></div>
    </div>
  </div>:null;
  return { dialog };
}
