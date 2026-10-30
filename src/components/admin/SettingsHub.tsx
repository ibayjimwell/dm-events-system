'use client';

import { useCallback, useEffect, useState } from 'react';
import { DatabaseBackup, Settings2, ShieldCheck } from 'lucide-react';
import BackupSettings from '@/components/admin/BackupSettings';
import Backups from '@/components/admin/Backups';

type Tab = 'policy' | 'backups';
type Props = { canSettings: boolean; canBackups: boolean; initialTab: Tab };

/**
 * Persistent client-side tabs live at the EXISTING /admin/maintenance/settings
 * route. No separate /backups page is necessary for the Backup Center to work.
 * The server page and the individual APIs still enforce permission checks.
 */
export default function SettingsHub({ canSettings, canBackups, initialTab }: Props) {
  const permitted = useCallback((tab: Tab): boolean =>
    tab === 'policy' ? canSettings : canBackups, [canSettings, canBackups]);
  const [tab, setTab] = useState<Tab>(initialTab);

  // A More-menu link can open the Backup tab directly using ?tab=backups.
  useEffect(() => { setTab(initialTab); }, [initialTab]);

  // Browser back/forward must also keep the selected tab in sync.
  useEffect(() => {
    function onPopstate() {
      const value = new URLSearchParams(window.location.search).get('tab');
      const next: Tab = value === 'backups' ? 'backups' : 'policy';
      setTab(permitted(next) ? next : canSettings ? 'policy' : 'backups');
    }
    window.addEventListener('popstate', onPopstate);
    return () => window.removeEventListener('popstate', onPopstate);
  }, [permitted, canSettings]);

  function switchTab(next: Tab) {
    if (!permitted(next)) return;
    setTab(next);
    // Next.js App Router integrates native History API updates, allowing an
    // in-place React transition with no full page navigation or global loader.
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  const selected: Tab = permitted(tab) ? tab : canSettings ? 'policy' : 'backups';

  return <div className="min-h-[60vh]" data-dm-settings-hub="r2-integrated">
    <div className="page-wrap pt-5 sm:pt-7">
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex items-center gap-2 px-2 pb-3 text-sm font-semibold text-slate-700">
          <ShieldCheck size={17} className="text-sky-700" /> Administration / System settings
        </div>
        <div role="tablist" aria-label="System maintenance" className="flex flex-wrap gap-2">
          {canSettings && <button type="button" role="tab" id="tab-policy"
            aria-selected={selected === 'policy'} aria-controls="panel-policy"
            onClick={() => switchTab('policy')}
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${selected === 'policy' ? 'bg-sky-900 text-white' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
            <Settings2 size={17} /> System settings
          </button>}
          {canBackups && <button type="button" role="tab" id="tab-backups"
            aria-selected={selected === 'backups'} aria-controls="panel-backups"
            onClick={() => switchTab('backups')}
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${selected === 'backups' ? 'bg-sky-900 text-white' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
            <DatabaseBackup size={17} /> Cloudflare R2 backups
          </button>}
        </div>
      </div>
    </div>
    {selected === 'policy' && canSettings && <div id="panel-policy" role="tabpanel" aria-labelledby="tab-policy"><BackupSettings canBackups={canBackups} /></div>}
    {selected === 'backups' && canBackups && <div id="panel-backups" role="tabpanel" aria-labelledby="tab-backups"><Backups canSettings={canSettings} /></div>}
  </div>;
}
