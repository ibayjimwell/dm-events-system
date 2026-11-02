'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, json } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { ListSkeleton, InlineSkeleton } from '@/components/ui/LoadingSkeleton';
import { Eye, EyeOff, LockKeyhole, Search, ShieldCheck, UserPlus, Users, UserRoundCheck, UserRoundX } from 'lucide-react';

type Role = 'CLIENT' | 'COORDINATOR' | 'ADMIN';
type User = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  isActive: boolean;
  isRootAdmin: boolean;
};
type Override = 'ALLOW' | 'DENY' | 'INHERIT';
type Module = {
  key: string;
  group: string;
  label: string;
  description: string;
  adminOnly: boolean;
  clientOnly: boolean;
  assignable: boolean;
  inherited: boolean;
  effective: boolean;
  override: Override;
};
type Access = {
  user: Pick<User, 'id' | 'fullName' | 'email' | 'role' | 'isRootAdmin'>;
  modules: Module[];
};
type AccountFilter = 'ALL' | 'STAFF' | 'CLIENT';

const control = 'mt-1.5 w-full min-w-0 rounded-lg border border-[#cad8e5] bg-white px-3 py-2.5 text-sm text-[#122c44] outline-none transition-colors focus:border-[#0b4d98] focus:ring-2 focus:ring-blue-100';
const panel = 'min-w-0 rounded-xl border border-[#dae4ed] bg-white p-4 shadow-sm sm:p-5';
const isEmployee = (user: User) => user.role === 'COORDINATOR' || user.role === 'ADMIN';

export default function UsersEditor() {
  const { data, error, refresh, loading } = useLiveQuery(() => api<{ users: User[] }>('/api/users'), [],{cacheKey:'admin:/api/users',realtimeKinds:['users','user_module_permissions']});
  const users = data?.users ?? [];
  const editableUsers = useMemo(() => users, [data?.users]);

  // Every user, including clients and non-root administrators, is editable.
  const [selectedUserId, setSelectedUserId] = useState('');
  const [access, setAccess] = useState<Access | null>(null);
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [savingPermission, setSavingPermission] = useState<string | null>(null);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState<AccountFilter>('ALL');
  const [accountSearch, setAccountSearch] = useState('');
  const [moduleSearch, setModuleSearch] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<Role>('COORDINATOR');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setSelectedUserId(current =>
      editableUsers.some(user => user.id === current) ? current : (editableUsers[0]?.id ?? '')
    );
  }, [editableUsers]);

  useEffect(() => {
    if (!selectedUserId) {
      setAccess(null);
      return;
    }
    let active = true;
    setAccess(null);
    setAccessError('');
    setLoadingAccess(true);
    void api<Access>(`/api/permissions?userId=${encodeURIComponent(selectedUserId)}`)
      .then(value => { if (active) setAccess(value); })
      .catch(caught => {
        if (active) setAccessError(caught instanceof Error ? caught.message : 'Unable to load account permissions.');
      })
      .finally(() => { if (active) setLoadingAccess(false); });
    return () => { active = false; };
  }, [selectedUserId]);

  const selectedUser = editableUsers.find(user => user.id === selectedUserId);
  const filteredUsers = users
    .filter(user => accountFilter === 'ALL' || (accountFilter === 'STAFF' ? isEmployee(user) : user.role === 'CLIENT'))
    .filter(user => `${user.fullName} ${user.email}`.toLowerCase().includes(accountSearch.trim().toLowerCase()))
    .sort((a, b) => Number(isEmployee(b)) - Number(isEmployee(a)) || a.fullName.localeCompare(b.fullName));
  const shownModules = (access?.user.id === selectedUserId ? access.modules : []).filter(module =>
    // Show only modules appropriate for the selected account. The Mother Admin
    // sees every module for audit, but that account is deliberately immutable.
    (module.assignable || (selectedUser?.isRootAdmin && module.effective)) &&
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
      setShowPassword(false);
      setNotice('Account created with NO module access. Assign modules to activate the portal. Share the temporary password securely.');
      await refresh();
      setSelectedUserId(result.id);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not create account.');
    } finally {
      setBusy(false);
    }
  }

  async function changeUser(user: User, update: Partial<Pick<User, 'role' | 'isActive'>>) {
    // Roles reset individual overrides and deactivation immediately removes access.
    if (update.role && update.role !== user.role &&
        !window.confirm(`Change ${user.fullName}'s role from ${user.role} to ${update.role}? This removes ALL existing module grants.`)) return;
    if (update.isActive === false && user.isActive &&
        !window.confirm(`Deactivate ${user.fullName}? They will lose access to DM Events.`)) return;
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
      if (newRole !== user.role) setSelectedUserId(user.id);
      if (selectedUserId === user.id) {
        setAccess(await api<Access>(`/api/permissions?userId=${user.id}`));
      }
      setNotice('Account updated. Changing a role clears all module grants; the Mother Admin must reassign them.');
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Unable to update account.');
    } finally {
      setUpdatingUser(null);
    }
  }

  async function setPermission(permission: string, override: Override) {
    if (!selectedUser || selectedUser.isRootAdmin) return;
    setSavingPermission(permission);
    setAccessError('');
    try {
      await api('/api/permissions', json('PATCH', {
        userId: selectedUser.id, permission, override,
      }));
      setAccess(await api<Access>(`/api/permissions?userId=${selectedUser.id}`));
      setNotice('Module permission saved. Access changes take effect on the next server request.');
    } catch (caught) {
      setAccessError(caught instanceof Error ? caught.message : 'Could not update module access.');
    } finally {
      setSavingPermission(null);
    }
  }

  return (
    <main className="page-wrap page-space min-w-0 workspace">
      <section className="workspace-hero"><div className="workspace-hero__top"><div><span className="workspace-kicker"><ShieldCheck size={15}/> ACCOUNTS & AUTHORIZATION</span><h1>People, roles & access</h1><p>Every new account starts with no modules. The Mother Admin assigns or revokes Client, Coordinator and Administrator access individually.</p></div></div></section>
      <div className="workspace-metrics">
        <div className="workspace-metric"><div className="workspace-metric__icon"><Users size={19}/></div><div className="workspace-metric__label">Total accounts</div><div className="workspace-metric__value">{users.length}</div><div className="workspace-metric__hint">Employees and Clients</div></div>
        <div className="workspace-metric"><div className="workspace-metric__icon"><UserRoundCheck size={19}/></div><div className="workspace-metric__label">Active accounts</div><div className="workspace-metric__value">{users.filter(user => user.isActive).length}</div><div className="workspace-metric__hint">Accounts currently enabled</div></div>
        <div className="workspace-metric"><div className="workspace-metric__icon"><UserRoundX size={19}/></div><div className="workspace-metric__label">Inactive accounts</div><div className="workspace-metric__value">{users.filter(user => !user.isActive).length}</div><div className="workspace-metric__hint">Access disabled by administrators</div></div>
      </div>
      {error && <p role="alert" className="error break-words">{error}</p>}
      {notice && <p role="status" className="notice mb-5 break-words">{notice}</p>}

      {/* Desktop: Accounts → Permissions → Create Account. Mobile: same order, stacked. */}
      <div className="workspace-section grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)_minmax(0,0.88fr)]">
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
          <label className="relative mb-3 block text-xs font-semibold text-[#33495f]">Find an account
            <Search size={16} className="pointer-events-none absolute bottom-3 left-3 text-[#72849a]" />
            <input className={`${control} pl-9`} value={accountSearch} onChange={event => setAccountSearch(event.target.value)} placeholder="Search name or email" type="search" />
          </label>
          <p className="mb-4 text-xs leading-5 text-[#748498]">Select any account to assign module permissions. Restricted modules cannot cross role boundaries.</p>
          <div className="max-h-[840px] space-y-3 overflow-y-auto pr-1">
            {loading && !data && <ListSkeleton label="Loading user accounts" />}
            {filteredUsers.map(user => (
              <article
                key={user.id}
                className={`min-w-0 rounded-lg border p-3 transition-colors ${selectedUserId === user.id ? 'border-[#0b4d98] bg-[#f1f7ff]' : 'border-[#dae4ed] bg-white'}`}
              >
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold text-[#122c44]">{user.fullName}</p>
                    <p className="mt-1 break-all text-xs text-[#748498]">{user.email}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${user.role === 'CLIENT' ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-800'}`}>
                    {user.isRootAdmin ? 'MOTHER ADMIN' : user.role}
                  </span>
                </div>
                <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-1">
                  <label className="block min-w-0 text-xs font-semibold text-[#33495f]">
                    Role
                    <select
                      className={control}
                      value={user.role}
                      disabled={updatingUser === user.id || user.isRootAdmin}
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
                      disabled={updatingUser === user.id || user.isRootAdmin}
                      onChange={event => void changeUser(user, { isActive: event.target.checked })}
                    />
                    Active
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedUserId(user.id)}
                  className="mt-3 min-h-10 w-full rounded-lg border border-[#0b4d98] px-3 text-xs font-semibold text-[#0b4d98] hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-[#0b4d98]"
                >
                  {selectedUserId === user.id ? 'Selected account' : 'Manage modules'}
                </button>
                {user.isRootAdmin && <p className="mt-2 text-xs leading-5 text-[#64748b]">Protected owner account. Role, status and permissions cannot be edited.</p>}
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
              <p className="mt-1 text-xs leading-5 text-[#748498]">All roles · Individual grants · Mother Admin controls</p>
            </div>
          </div>

          {editableUsers.length > 0 ? (
            <>
              <label className="block text-xs font-semibold text-[#33495f]">
                Select account
                <select
                  className={control}
                  value={selectedUserId}
                  onChange={event => setSelectedUserId(event.target.value)}
                >
                  {editableUsers.map(employee => (
                    <option key={employee.id} value={employee.id}>
                      {employee.fullName} — {employee.isRootAdmin ? 'MOTHER ADMIN' : employee.role}
                    </option>
                  ))}
                </select>
              </label>
              {selectedUser && (
                <p className="mt-3 min-w-0 break-words rounded-lg bg-[#edf4fb] p-3 text-xs leading-5 text-[#365574]">
                  <strong className="text-[#122c44]">{selectedUser.fullName}</strong><br />
                  {selectedUser.isRootAdmin
                    ? 'The Mother Admin always has full access and cannot be modified.'
                    : 'This account starts with no permissions. Grant only the modules required for its role.'}
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
              {loadingAccess && <InlineSkeleton label="Loading account permissions" rows={6} />}

              {!loadingAccess && selectedUser?.isRootAdmin && (
                <div className="mt-4 flex gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-[#215382]">
                  <LockKeyhole size={18} className="shrink-0" />
                  Mother Admin ownership is protected. Its full permissions are read-only.
                </div>
              )}
              {!loadingAccess && access?.user.id === selectedUserId && (
                <div className="mt-4 max-h-[900px] space-y-5 overflow-y-auto pr-1">
                  {groups.map(group => (
                    <section key={group} aria-label={`${group} modules`}>
                      <h4 className="mb-2 border-b border-[#dae4ed] pb-2 text-xs font-bold uppercase tracking-widest text-[#0b4d98]">{group}</h4>
                      <div className="space-y-2">
                        {shownModules.filter(module => module.group === group).map(module => {
                          const editable = Boolean(module.assignable && !selectedUser?.isRootAdmin);
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
                                <span className="text-xs text-[#62768b]">Default: {module.inherited ? 'Allowed' : 'No access'}</span>
                                {editable ? (
                                  <select
                                    className="min-h-10 w-full rounded-lg border border-[#cad8e5] bg-white px-2 text-xs font-semibold text-[#122c44] sm:w-[160px]"
                                    aria-label={`${module.label} permission`}
                                    value={module.override}
                                    disabled={savingPermission === module.key}
                                    onChange={event => void setPermission(module.key, event.target.value as Override)}
                                  >
                                    <option value="INHERIT">No access (default)</option>
                                    <option value="ALLOW">Grant access</option>
                                    <option value="DENY">Deny access</option>
                                  </select>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[#72849a]">
                                    <LockKeyhole size={13} /> {selectedUser?.isRootAdmin ? 'Protected owner' : 'Not available to this role'}
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
            <p className="rounded-lg bg-[#f1f6fa] p-4 text-sm text-[#748498]">Create an account to assign individual module access.</p>
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
            <div>
              <label htmlFor="new-user-password" className="block text-xs font-semibold text-[#33495f]">
                Temporary password
              </label>
              <div className="relative mt-1.5">
                <input
                  id="new-user-password"
                  className={`${control} !mt-0 pr-12`}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  required
                  minLength={12}
                  onChange={event => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-[#536c83] transition-colors hover:text-[#0b4d98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b4d98]"
                  onClick={() => setShowPassword(value => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  aria-controls="new-user-password"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                </button>
              </div>
            </div>
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
            New accounts (including Administrators) start with no module permissions. The Mother Admin assigns individual access afterward. Client-only modules remain isolated from staff modules. All changes are audited.
          </p>
        </aside>
      </div>
    </main>
  );
}
