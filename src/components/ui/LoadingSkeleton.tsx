/** Skeletons for route transitions and first client-side API responses. */
const bar = 'animate-pulse rounded-md bg-[#dfe8f1]';

export function InlineSkeleton({ rows = 3, label = 'Loading section' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className="space-y-3 py-3">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={`${bar} h-4 ${index % 3 === 2 ? 'w-2/3' : 'w-full'}`} />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function StatSkeleton() {
  return (
    <div role="status" aria-label="Loading summary" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="min-w-0 rounded-xl border border-[#dae4ed] bg-white p-5">
          <div className={`${bar} mb-4 h-4 w-1/2`} />
          <div className={`${bar} mb-3 h-9 w-2/5`} />
          <div className={`${bar} h-3 w-4/5`} />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 4, label = 'Loading records' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className="space-y-3 py-2">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex flex-wrap items-center gap-4 rounded-lg border border-[#e5edf4] p-4">
          <div className={`${bar} h-8 w-8 shrink-0 rounded-full`} />
          <div className="min-w-[130px] flex-1 space-y-2"><div className={`${bar} h-4 w-2/3`} /><div className={`${bar} h-3 w-4/5`} /></div>
          <div className={`${bar} h-6 w-20 rounded-full`} />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function DetailSkeleton({ label = 'Loading booking details' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(290px,1fr)]">
      <section className="rounded-xl border border-[#dae4ed] bg-white p-5">
        <div className={`${bar} mb-6 h-6 w-1/2`} />
        <InlineSkeleton rows={8} label={label} />
      </section>
      <section className="rounded-xl border border-[#dae4ed] bg-white p-5">
        <div className={`${bar} mb-6 h-6 w-3/4`} />
        <InlineSkeleton rows={6} label="Loading actions" />
      </section>
    </div>
  );
}

export function RouteSkeleton() {
  return (
    <main className="page-wrap page-space" role="status" aria-label="Opening section" aria-busy="true">
      <div className={`${bar} mb-4 h-9 w-60 max-w-full`} />
      <div className={`${bar} mb-6 h-4 w-80 max-w-full`} />
      <StatSkeleton />
      <div className="mt-6"><DetailSkeleton label="Opening section" /></div>
    </main>
  );
}
