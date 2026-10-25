'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, json } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { PageTitle } from '@/components/ui/Blocks';
import { LockKeyhole, Search, ShieldCheck, UserPlus, Users } from 'lucide-react';

type Role = 'CLIENT' | 'COORDINATOR' | 'ADMIN';
type User = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  isActive: boolean;
};
type Override = 'ALLOW' | 'DENY' | 'INHERIT';
type Module = {
  key: string;
  group: string;
  label: string;
  description: string;
  adminOnly: boolean;
  clientOnly: boolean;
  inherited: boolean;
  effective: boolean;
  override: Override;
};
type Access = {
  user: Pick<User, 'id' | 'fullName' | 'email' | 'role'>;
  modules: Module[];
};
type AccountFilter = 'ALL' | 'STAFF' | 'CLIENT';

const control = 'mt-1.5 w-full min-w-0 rounded-lg border border-[#cad8e5] bg-white px-3 py-2.5 text-sm text-[#122c44] outline-none transition-colors focus:border-[#0b4d98] focus:ring-2 focus:ring-blue-100';
const panel = 'min-w-0 rounded-xl border border-[#dae4ed] bg-white p-4 shadow-sm sm:p-5';
const isEmployee = (user: User) => user.role === 'COORDINATOR' || user.role === 'ADMIN';

export default function UsersEditor() {
  const { data, error, refresh } = useLiveQuery(() => api<{ users: User[] }>('/api/users'), []);
  const users = data?.users ?? [];
  const employees = useMemo(() => users.filter(isEmployee), [data?.users]);

  // Employee-only selection: clients cannot be selected for module overrides.
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [access, setAccess] = useState<Access | null>(null);
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [savingPermission, setSavingPermission] = useState<string | null>(null);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState<AccountFilter>('ALL');
  const [moduleSearch, setModuleSearch] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('COORDINATOR');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setSelectedEmployeeId(current =>
      employees.some(employee => employee.id === current) ? current : (employees[0]?.id ?? '')
    );
  }, [employees]);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setAccess(null);
      return;
    }
    let active = true;
    setAccess(null);
    setAccessError('');
    setLoadingAccess(true);
    void api<Access>(`/api/permissions?userId=${encodeURIComponent(selectedEmployeeId)}`)
      .then(value => { if (active) setAccess(value); })
      .catch(caught => {
        if (active) setAccessError(caught instanceof Error ? caught.message : 'Unable to load employee permissions.');
      })
      .finally(() => { if (active) setLoadingAccess(false); });
    return () => { active = false; };
  }, [selectedEmployeeId]);

  const selectedEmployee = employees.find(employee => employee.id === selectedEmployeeId);
  const filteredUsers = users
    .filter(user => accountFilter === 'ALL' || (accountFilter === 'STAFF' ? isEmployee(user) : user.role === 'CLIENT'))
    .sort((a, b) => Number(isEmployee(b)) - Number(isEmployee(a)) || a.fullName.localeCompare(b.fullName));
  const shownModules = (access?.user.id === selectedEmployeeId ? access.modules : []).filter(module =>
    // Client self-service actions are fixed and do not belong in the employee editor.
    !module.clientOnly &&
    `${module.group} ${module.label} ${module.description} ${module.key}`
      .toLowerCase().includes(moduleSearch.trim().toLowerCase())
  );
  const groups = [...new Set(shownModules.map(module => module.group))];

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      const result = await api<{ id: string }>('/api/users', json('POST', {
        fullName: name, email, password, role,
      }));
      setName('');
      setEmail('');
      setPassword('');
      setNotice('Account created. Share the temporary password securely and ask the user to reset it.');
      await refresh();
      if (role !== 'CLIENT') setSelectedEmployeeId(result.id);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not create account.');
    } finally {
      setBusy(false);
    }
  }

  async function changeUser(user: User, update: Partial<Pick<User, 'role' | 'isActive'>>) {
    setUpdatingUser(user.id);
    setNotice('');
    try {
      await api('/api/users', json('PATCH', {
        id: user.id,
        role: update.role ?? user.role,
        isActive: update.isActive ?? user.isActive,
      }));
      await refresh();
      const newRole = update.role ?? user.role;
      if (newRole !== 'CLIENT' && newRole !== user.role) setSelectedEmployeeId(user.id);
      if (selectedEmployeeId === user.id && newRole !== 'CLIENT') {
        setAccess(await api<Access>(`/api/permissions?userId=${user.id}`));
      }
      setNotice('Account updated. Role changes reset individual permission overrides.');
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Unable to update account.');
    } finally {
      setUpdatingUser(null);
    }
  }

  async function setPermission(permission: string, override: Override) {
    if (!selectedEmployee || selectedEmployee.role !== 'COORDINATOR') return;
    setSavingPermission(permission);
    setAccessError('');
    try {
      await api('/api/permissions', json('PATCH', {
        userId: selectedEmployee.id, permission, override,
      }));
      setAccess(await api<Access>(`/api/permissions?userId=${selectedEmployee.id}`));
      setNotice('Module permission saved. The change applies on the next server request.');
    } catch (caught) {
      setAccessError(caught instanceof Error ? caught.message : 'Could not update module access.');
    } finally {
      setSavingPermission(null);
    }
  }

  return (
    <main className="page-wrap page-space min-w-0">
      <PageTitle
        title="Website roles & access"
        subtitle="Manage all accounts and grant individual modules to DM Events employees. Client permissions are fixed."
      />
      {error && <p role="alert" className="error break-words">{error}</p>}
      {notice && <p role="status" className="notice mb-5 break-words">{notice}</p>}

      {/* Desktop: Accounts → Permissions → Create Account. Mobile: same order, stacked. */}
      <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)_minmax(0,0.88fr)]">
        <section className={panel} aria-labelledby="account-list-heading">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 id="account-list-heading" className="!m-0 flex items-center gap-2 text-xl font-semibold">
              <Users size={20} className="shrink-0 text-[#0b4d98]" /> Accounts & roles
            </h3>
            <span className="rounded-md bg-[#eef4fb] px-2 py-1 text-xs font-medium text-[#365574]">
              {users.length} accounts
            </span>
          </div>
          <div role="group" aria-label="Filter account types" className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-[#edf3f8] p-1">
            {(['ALL', 'STAFF', 'CLIENT'] as AccountFilter[]).map(filter => (
              <button
                key={filter}
                type="button"
                aria-pressed={accountFilter === filter}
                onClick={() => setAccountFilter(filter)}
                className={`rounded-md px-2 py-2 text-xs font-semibold transition-colors ${accountFilter === filter ? 'bg-white text-[#0b4d98] shadow-sm' : 'text-[#536c85] hover:bg-white/60'}`}
              >
                {filter === 'ALL' ? 'All' : filter === 'STAFF' ? 'Employees' : 'Clients'}
              </button>
            ))}
          </div>
          <p className="mb-4 text-xs leading-5 text-[#748498]">Select an employee to edit their module permissions. Client accounts remain manageable here, but their modules are not editable.</p>
          <div className="max-h-[840px] space-y-3 overflow-y-auto pr-1">
            {filteredUsers.map(user => (
              <article
                key={user.id}
                className={`min-w-0 rounded-lg border p-3 transition-colors ${selectedEmployeeId === user.id ? 'border-[#0b4d98] bg-[#f1f7ff]' : 'border-[#dae4ed] bg-white'}`}
              >
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold text-[#122c44]">{user.fullName}</p>
                    <p className="mt-1 break-all text-xs text-[#748498]">{user.email}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${user.role === 'CLIENT' ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-800'}`}>
                    {user.role}
                  </span>
                </div>
                <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-1">
                  <label className="block min-w-0 text-xs font-semibold text-[#33495f]">
                    Role
                    <select
                      className={control}
                      value={user.role}
                      disabled={updatingUser === user.id}
                      onChange={event => void changeUser(user, { role: event.target.value as Role })}
                    >
                      <option value="CLIENT">CLIENT</option>
                      <option value="COORDINATOR">COORDINATOR</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </label>
                  <label className="flex min-h-11 items-center gap-2 text-xs font-semibold text-[#33495f]">
                    <input
                      type="checkbox"
                      className="size-4 accent-[#0b4d98]"
                      checked={user.isActive}
                      disabled={updatingUser === user.id}
                      onChange={event => void changeUser(user, { isActive: event.target.checked })}
                    />
                    Active
                  </label>
                </div>
                {isEmployee(user) ? (
                  <button
                    type="button"
                    onClick={() => setSelectedEmployeeId(user.id)}
                    className="mt-3 min-h-10 w-full rounded-lg border border-[#0b4d98] px-3 text-xs font-semibold text-[#0b4d98] hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-[#0b4d98]"
                  >
                    {selectedEmployeeId === user.id ? 'Selected employee' : 'Manage modules'}
                  </button>
                ) : (
                  <p className="mt-3 rounded-md bg-slate-50 px-2 py-2 text-xs text-[#64748b]">Fixed client permissions</p>
                )}
              </article>
            ))}
            {!filteredUsers.length && <p className="py-8 text-center text-sm text-[#748498]">No accounts in this category.</p>}
          </div>
        </section>

        <section className={panel} aria-labelledby="module-permissions-heading">
          <div className="mb-3 flex items-start gap-2">
            <ShieldCheck size={22} className="mt-0.5 shrink-0 text-[#0b4d98]" />
            <div className="min-w-0">
              <h3 id="module-permissions-heading" className="!m-0 text-xl font-semibold">Module permissions</h3>
              <p className="mt-1 text-xs leading-5 text-[#748498]">Employees only · Coordinator & Administrator</p>
            </div>
          </div>

          {employees.length > 0 ? (
            <>
              <label className="block text-xs font-semibold text-[#33495f]">
                Select employee
                <select
                  className={control}
                  value={selectedEmployeeId}
                  onChange={event => setSelectedEmployeeId(event.target.value)}
                >
                  {employees.map(employee => (
                    <option key={employee.id} value={employee.id}>
                      {employee.fullName} — {employee.role}
                    </option>
                  ))}
                </select>
              </label>
              {selectedEmployee && (
                <p className="mt-3 min-w-0 break-words rounded-lg bg-[#edf4fb] p-3 text-xs leading-5 text-[#365574]">
                  <strong className="text-[#122c44]">{selectedEmployee.fullName}</strong><br />
                  {selectedEmployee.role === 'ADMIN'
                    ? 'Administrator permissions are inherited from the role and cannot be overridden.'
                    : 'Grant or deny individual modules without changing this Coordinator’s role.'}
                </p>
              )}

              <label className="relative mt-4 block text-xs font-semibold text-[#33495f]">
                Find a module
                <Search size={16} className="pointer-events-none absolute bottom-3 left-3 text-[#72849a]" />
                <input
                  value={moduleSearch}
                  onChange={event => setModuleSearch(event.target.value)}
                  className={`${control} pl-9`}
                  placeholder="Search modules..."
                />
              </label>
              {accessError && <p role="alert" className="error mt-3 break-words">{accessError}</p>}
              {loadingAccess && <p role="status" className="py-8 text-center text-sm text-[#748498]">Loading employee permissions…</p>}

              {!loadingAccess && selectedEmployee?.role === 'ADMIN' && (
                <div className="mt-4 flex gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-[#215382]">
                  <LockKeyhole size={18} className="shrink-0" />
                  Administrator access is protected by the role. The permissions below are read-only.
                </div>
              )}
              {!loadingAccess && access?.user.id === selectedEmployeeId && (
                <div className="mt-4 max-h-[900px] space-y-5 overflow-y-auto pr-1">
                  {groups.map(group => (
                    <section key={group} aria-label={`${group} modules`}>
                      <h4 className="mb-2 border-b border-[#dae4ed] pb-2 text-xs font-bold uppercase tracking-widest text-[#0b4d98]">{group}</h4>
                      <div className="space-y-2">
                        {shownModules.filter(module => module.group === group).map(module => {
                          const editable = selectedEmployee?.role === 'COORDINATOR' && !module.adminOnly;
                          return (
                            <article key={module.key} className="min-w-0 rounded-lg border border-[#e0e8ef] bg-[#fbfdff] p-3">
                              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                                <h5 className="min-w-0 flex-1 break-words text-sm font-semibold text-[#122c44]">{module.label}</h5>
                                <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${module.effective ? 'bg-[#e0f4e9] text-[#187966]' : 'bg-[#fff0ef] text-[#b13f51]'}`}>
                                  {module.effective ? 'Allowed' : 'Restricted'}
                                </span>
                              </div>
                              <p className="mt-1 break-words text-xs leading-5 text-[#748498]">{module.description}</p>
                              <p className="mt-1 break-all font-mono text-[10px] text-[#8b9cac]">{module.key}</p>
                              <div className="mt-3 flex flex-col gap-2 border-t border-[#e3eaf1] pt-3 sm:flex-row sm:items-center sm:justify-between">
                                <span className="text-xs text-[#62768b]">Role default: {module.inherited ? 'Allowed' : 'Restricted'}</span>
                                {editable ? (
                                  <select
                                    className="min-h-10 w-full rounded-lg border border-[#cad8e5] bg-white px-2 text-xs font-semibold text-[#122c44] sm:w-[160px]"
                                    aria-label={`${module.label} permission`}
                                    value={module.override}
                                    disabled={savingPermission === module.key}
                                    onChange={event => void setPermission(module.key, event.target.value as Override)}
                                  >
                                    <option value="INHERIT">Role default</option>
                                    <option value="ALLOW">Grant access</option>
                                    <option value="DENY">Deny access</option>
                                  </select>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[#72849a]">
                                    <LockKeyhole size={13} /> {module.adminOnly ? 'Administrator only' : 'Role-managed'}
                                  </span>
                                )}
                              </div>
                              {savingPermission === module.key && <p role="status" className="mt-2 text-xs text-[#0b4d98]">Saving…</p>}
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                  {!groups.length && <p className="py-6 text-center text-xs text-[#748498]">No modules match your search.</p>}
                </div>
              )}
            </>
          ) : (
            <p className="rounded-lg bg-[#f1f6fa] p-4 text-sm text-[#748498]">Create a Coordinator or Administrator account to view employee modules.</p>
          )}
        </section>

        <aside className={`${panel} xl:sticky xl:top-24`} aria-labelledby="create-account-heading">
          <h3 id="create-account-heading" className="!m-0 mb-4 flex items-center gap-2 text-xl font-semibold">
            <UserPlus size={20} className="shrink-0 text-[#0b4d98]" /> Create account
          </h3>
          <form onSubmit={createAccount} className="grid min-w-0 gap-4">
            <label className="block text-xs font-semibold text-[#33495f]">
              Full name
              <input className={control} value={name} required minLength={2} onChange={event => setName(event.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-[#33495f]">
              Email address
              <input className={control} type="email" value={email} required onChange={event => setEmail(event.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-[#33495f]">
              Temporary password
              <input className={control} type="password" autoComplete="new-password" value={password} required minLength={12} onChange={event => setPassword(event.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-[#33495f]">
              Role
              <select className={control} value={role} onChange={event => setRole(event.target.value as Role)}>
                <option value="COORDINATOR">COORDINATOR</option>
                <option value="ADMIN">ADMIN</option>
                <option value="CLIENT">CLIENT</option>
              </select>
            </label>
            <button type="submit" className="btn w-full" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
          </form>
          <p className="mt-4 text-xs leading-6 text-[#748498]">
            Only Coordinators receive individual module grants. Administrators inherit their access. Client permissions remain fixed. All access changes are audited.
          </p>
        </aside>
      </div>
    </main>
  );
}
