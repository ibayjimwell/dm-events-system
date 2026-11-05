'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Database, Download, FileArchive, FileSearch, Info, LockKeyhole, Search, ShieldCheck, X,
} from 'lucide-react';
import type { BackupOverview, BackupPreview } from '@/lib/backupExplorer';

type Section = 'overview' | 'records' | 'recovery';
type Props = {
  path: string;
  report: BackupOverview;
  busy: boolean;
  onClose: () => void;
  onDownload: () => void;
};

const pesos = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 });
const number = new Intl.NumberFormat('en-PH');
function dateTime(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
    : 'Unknown';
}
function readable(value: string | number | boolean | null): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}
function SummaryItem({ title, value, caption }: { title: string; value: string | number; caption?: string }) {
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
    <p className="mt-2 break-words text-xl font-extrabold text-[#143d5e]">{value}</p>
    {caption && <p className="mt-1 text-xs leading-5 text-slate-500">{caption}</p>}
  </div>;
}
function CountList({ title, values }: { title: string; values: { label: string; count: number }[] }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4">
    <h4 className="font-bold text-[#143d5e]">{title}</h4>
    {values.length ? <div className="mt-3 space-y-2">{values.map(v => <div key={v.label} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 text-sm last:border-0 last:pb-0"><span className="min-w-0 break-words text-slate-700">{v.label}</span><strong className="shrink-0 tabular-nums text-slate-900">{number.format(v.count)}</strong></div>)}</div>
      : <p className="mt-3 text-sm text-slate-500">No records of this type in the selected snapshot.</p>}
  </div>;
}

export default function BackupExplorer({ path, report, busy, onClose, onDownload }: Props) {
  const [section, setSection] = useState<Section>('overview');
  const [selected, setSelected] = useState(report.tableDetails.find(t => t.name === 'bookings')?.name || report.tableDetails[0]?.name || '');
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<BackupPreview | null>(null);
  const [fetchError, setFetchError] = useState('');
  const [loading, setLoading] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const PAGE_SIZE = 20;
  const entry = useMemo(() => report.tableDetails.find(t => t.name === selected), [report, selected]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') onClose(); }
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('keydown', escape); previous?.focus(); };
  }, [onClose]);

  useEffect(() => {
    if (section !== 'records' || !selected || !entry?.previewable) {
      setData(null); setFetchError(''); setLoading(false); return;
    }
    const controller = new AbortController();
    setLoading(true); setFetchError(''); setData(null);
    const params = new URLSearchParams({
      action: 'records', path, table: selected, offset: String(page * PAGE_SIZE), limit: String(PAGE_SIZE), q: search,
    });
    void (async () => {
      try {
        const response = await fetch(`/api/backups/file?${params}`, {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        });
        const body: unknown = await response.json();
        if (!response.ok) {
          const error = body && typeof body === 'object' && 'error' in body ? String(body.error) : `Request failed (${response.status})`;
          throw new Error(error);
        }
        if (!controller.signal.aborted) setData(body as BackupPreview);
      } catch (error) {
        if (!controller.signal.aborted) setFetchError(error instanceof Error ? error.message : 'Unable to load backup records.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [entry?.previewable, page, path, search, section, selected]);

  function selectTable(name: string) {
    setSelected(name); setPage(0); setSearch(''); setSearchInput(''); setData(null);
    setSection('records');
  }
  const rangeStart = data?.matchedRows ? data.offset + 1 : 0;
  const rangeEnd = data ? Math.min(data.offset + data.limit, data.matchedRows) : 0;

  return <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/75 p-2 sm:p-5" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="backup-explorer-heading" className="my-2 flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl sm:my-5">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-5 sm:px-6">
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-sky-800"><FileSearch size={16}/> Saved database snapshot</span>
          <h2 id="backup-explorer-heading" className="mt-1 text-xl font-extrabold text-[#143d5e] sm:text-2xl">Backup details &amp; data explorer</h2>
          <p className="mt-1 break-all text-xs text-slate-600">{report.filename}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={onDownload} disabled={busy} className="btn btn-outline !px-3 !py-2"><Download size={16}/> Download</button>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close backup details" className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-100"><X size={20}/></button>
        </div>
      </header>

      <div className="border-b border-slate-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 sm:px-6">
        <p className="flex items-start gap-2"><ShieldCheck size={19} className="mt-0.5 shrink-0"/><span><strong>Archive integrity verified.</strong> Encrypted file successfully decrypted and SHA-256 validated. <strong>Restore not tested.</strong> These are historical snapshot records, not live data.</span></p>
      </div>
      <nav aria-label="Backup details sections" className="flex flex-wrap gap-2 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        {([['overview', 'Overview', Database], ['records', 'Explore records', FileSearch], ['recovery', 'Recovery & protection', LockKeyhole]] as const).map(([id, label, Icon]) =>
          <button key={id} type="button" onClick={() => setSection(id)} aria-current={section === id ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold ${section === id ? 'bg-[#143d5e] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
            <Icon size={16}/>{label}
          </button>)}
      </nav>

      <div className="max-h-[72vh] min-h-[330px] overflow-y-auto p-4 sm:p-6">
        {section === 'overview' && <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryItem title="Exported (Philippine time)" value={dateTime(report.exportedAt)}/>
            <SummaryItem title="Database tables" value={number.format(report.tables)} caption="Public schema, data only"/>
            <SummaryItem title="Total records" value={number.format(report.rows)} caption="Across all exported tables"/>
            <SummaryItem title="Event bookings" value={number.format(report.bookings.total)} caption={`${number.format(report.bookings.upcomingConfirmed)} confirmed events on or after export date`}/>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <CountList title="Bookings by status" values={report.bookings.byStatus.map(v => ({ label: v.status, count: v.count }))}/>
            <CountList title="Event types" values={report.bookings.byEventType.map(v => ({ label: v.eventType, count: v.count }))}/>
            <CountList title="User accounts by role" values={report.accounts.byRole.map(v => ({ label: v.role, count: v.count }))}/>
          </div>
          <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <h3 className="text-lg font-extrabold text-[#143d5e]">Booking value snapshot</h3>
            <p className="mt-1 text-sm text-slate-600">Values below describe confirmed booking commitments and historical ledger movements. They are <strong>not payments received, realized revenue, or profit.</strong></p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryItem title="Current confirmed / completed value" value={pesos.format(report.finance.currentConfirmedValue)} caption="Agreed values in the snapshot"/>
              <SummaryItem title="Positive value movements" value={pesos.format(report.finance.positiveMovements)} caption="All recorded increases"/>
              <SummaryItem title="Reductions & reversals" value={pesos.format(report.finance.negativeMovements)} caption="All recorded decreases"/>
              <SummaryItem title="Net historical movement" value={pesos.format(report.finance.netMovements)} caption="Ledger increases minus decreases"/>
            </div>
          </section>
          <div className="grid gap-3 lg:grid-cols-3">
            <SummaryItem title="Published packages" value={`${number.format(report.packages.published)} / ${number.format(report.packages.total)}`}/>
            <SummaryItem title="Client feedback" value={report.feedback.averageRating == null ? 'No ratings' : `${report.feedback.averageRating.toFixed(2)} / 5`} caption={`${number.format(report.feedback.publicReviews)} public of ${number.format(report.feedback.total)} total`}/>
            <SummaryItem title="Messages" value={number.format(report.communications.messages)} caption={`${number.format(report.communications.deletedThreads)} recorded chat-deletion states`}/>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
            <div className="flex items-start gap-3"><Info size={19} className="mt-1 shrink-0 text-sky-800"/><p className="text-sm text-sky-950">Need to inspect actual records? Open <strong>Explore records</strong>, choose a table, and search or page through its safe-to-preview fields.</p></div>
            <button type="button" onClick={() => setSection('records')} className="btn btn-outline !py-2">Explore records <ArrowRight size={16}/></button>
          </div>
        </div>}

        {section === 'records' && <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="text-lg font-extrabold text-[#143d5e]">Snapshot table explorer</h3>
              <p className="mt-1 text-sm text-slate-600">All {number.format(report.tables)} tables are listed. Sensitive tables show counts only. All previews are read-only.</p></div>
            <span className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-3 py-2 text-xs font-bold text-sky-900"><LockKeyhole size={14}/> Protected preview</span>
          </div>
          <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside aria-label="Saved database tables" className="max-h-[480px] space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
              {report.tableDetails.map(t => <button type="button" key={t.name} onClick={() => selectTable(t.name)}
                aria-current={selected === t.name ? 'true' : undefined}
                className={`flex w-full items-start justify-between gap-2 rounded-lg px-3 py-3 text-left text-sm ${selected === t.name ? 'bg-sky-100 text-sky-950' : 'text-slate-700 hover:bg-slate-100'}`}>
                <span className="min-w-0"><span className="block font-bold">{t.label}</span><span className="block break-all text-xs opacity-70">{t.name}</span></span>
                <span className="flex shrink-0 items-center gap-1 text-xs">{!t.previewable && <LockKeyhole size={13}/>} {number.format(t.rows)}</span>
              </button>)}
            </aside>
            <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-4" aria-live="polite">
              {entry ? <>
                <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-extrabold text-[#143d5e]">{entry.label}</h4><p className="mt-1 break-all text-xs text-slate-500">{entry.name} · {number.format(entry.rows)} saved rows · {number.format(entry.columns)} original columns</p></div><span className="text-xs font-semibold text-slate-500">{entry.category}</span></div>
                {!entry.previewable ? <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><LockKeyhole size={19} className="mb-2"/>This table is included in the encrypted backup, but its row preview is restricted. Authentication and configuration secrets are never displayed in the browser.</div>
                : <>
                  <form className="mt-4 flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); setPage(0); setSearch(searchInput.trim()); }}>
                    <label htmlFor="backup-row-search" className="sr-only">Search saved records</label>
                    <input id="backup-row-search" value={searchInput} onChange={e => setSearchInput(e.target.value.slice(0,100))} placeholder="Search visible fields..." maxLength={100}
                      className="min-w-[190px] flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"/>
                    <button type="submit" className="btn btn-outline !px-3 !py-2"><Search size={16}/> Search</button>
                    {search && <button type="button" className="rounded-lg px-2 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100" onClick={() => {setSearchInput('');setSearch('');setPage(0);}}>Clear</button>}
                  </form>
                  {loading && <div role="status" className="mt-5 space-y-3 animate-pulse"><div className="h-9 rounded bg-slate-100"/><div className="h-9 rounded bg-slate-100"/><div className="h-9 rounded bg-slate-100"/></div>}
                  {fetchError && <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"><AlertTriangle size={16}/>{fetchError}</p>}
                  {!loading && data?.previewable && <>
                    <p className="mt-4 text-xs text-slate-500">Displaying {number.format(rangeStart)}–{number.format(rangeEnd)} of {number.format(data.matchedRows)} matching records. Only approved fields are shown.</p>
                    <div className="mt-2 max-w-full overflow-x-auto rounded-lg border border-slate-200">
                      <table className="min-w-full text-left text-xs"><thead className="bg-slate-100 text-slate-700"><tr>{data.columns.map(c => <th key={c} scope="col" className="whitespace-nowrap border-b border-slate-200 px-3 py-3 font-bold">{c.replaceAll('_', ' ')}</th>)}</tr></thead>
                        <tbody>{data.rows.map((row, i) => <tr key={`${page}-${i}`} className="border-b border-slate-100 align-top last:border-0">{data.columns.map(c => <td key={c} className="max-w-[260px] break-words px-3 py-3 text-slate-800">{readable(row[c] ?? null)}</td>)}</tr>)}</tbody>
                      </table>
                      {data.rows.length === 0 && <p className="p-5 text-center text-sm text-slate-500">No matching saved records.</p>}
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3"><button type="button" disabled={page === 0} onClick={() => setPage(p => Math.max(0,p-1))} className="btn btn-outline !px-3 !py-2 disabled:opacity-50"><ArrowLeft size={15}/> Previous</button>
                      <span className="text-xs text-slate-600">Page {page + 1} of {Math.max(1,Math.ceil(data.matchedRows / PAGE_SIZE))}</span>
                      <button type="button" disabled={(page + 1) * PAGE_SIZE >= data.matchedRows} onClick={() => setPage(p => p + 1)} className="btn btn-outline !px-3 !py-2 disabled:opacity-50">Next <ArrowRight size={15}/></button></div>
                  </>}
                </>}
              </> : <p className="text-sm text-slate-500">This backup contains no tables.</p>}
            </section>
          </div>
        </div>}

        {section === 'recovery' && <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <SummaryItem title="Snapshot date" value={dateTime(report.exportedAt)}/>
            <SummaryItem title="Last verified" value={dateTime(report.verifiedAt)}/>
            <SummaryItem title="Backup format" value={report.format}/>
            <SummaryItem title="Database schema" value={report.schema}/>
          </div>
          <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><h3 className="flex items-center gap-2 font-extrabold text-[#143d5e]"><CheckCircle2 size={20} className="text-emerald-700"/> Verification evidence</h3>
            <p className="mt-2 text-sm text-slate-700">{report.message}</p>
            <p className="mt-4 text-xs font-bold text-slate-500">SHA-256 checksum</p><code className="mt-1 block break-all rounded-lg bg-slate-100 p-3 text-xs text-slate-700">{report.sha256}</code>
          </section>
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5"><h3 className="flex items-center gap-2 font-extrabold text-amber-950"><AlertTriangle size={19}/> Recovery limitations</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-amber-950">{report.warnings.map(item => <li key={item}>{item}</li>)}</ul>
            <p className="mt-4 text-sm font-semibold text-amber-950">Recommended: download this archive, retain the matching Drizzle migrations, and conduct a restore rehearsal on an isolated database before relying on it for recovery.</p>
          </section>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4"><CalendarDays size={20} className="text-sky-700"/><p className="flex-1 text-sm text-slate-700">This snapshot reflects the state on {dateTime(report.exportedAt)}. Later live edits are not present.</p><button type="button" className="btn btn-outline !py-2" onClick={onDownload} disabled={busy}><FileArchive size={16}/> Download verified archive</button></div>
        </div>}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 sm:px-6">
        <span className="flex items-center gap-2"><LockKeyhole size={14}/> Permission-restricted · No live database changes</span>
        <button type="button" className="rounded-lg px-3 py-2 font-bold text-sky-800 hover:bg-slate-100" onClick={onClose}>Close details</button>
      </footer>
    </section>
  </div>;
}
