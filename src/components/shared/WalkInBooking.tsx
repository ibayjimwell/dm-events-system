'use client';
import { Suspense } from 'react';
import BookingWizard from '@/components/client/BookingWizard';
import { InlineSkeleton } from '@/components/ui/LoadingSkeleton';
/** A single five-step wizard powers BOTH Client and Walk-in booking flows. */
export default function WalkInBooking({ role }: { role: 'ADMIN' | 'COORDINATOR' }) {
  return <Suspense fallback={<main className="page-wrap page-space"><InlineSkeleton rows={5} label="Preparing walk-in booking" /></main>}>
    <BookingWizard walkInRole={role} />
  </Suspense>;
}
