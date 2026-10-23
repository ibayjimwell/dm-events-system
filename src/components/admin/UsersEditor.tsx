'use client';

import { useState, type FormEvent } from 'react';
import { api, json } from '@/api-client/http';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { Panel, PageTitle, Field, Empty } from '@/components/ui/Blocks';

type User = {
  id: string;
  fullName: string;
  email: string;
  role: 'CLIENT' | 'COORDINATOR' | 'ADMIN';
  isActive: boolean;
};

export default function UsersEditor() {
  const { data, error, refresh } = useLiveQuery(() => api<{ users: User[] }>('/api/users'), []);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<User['role']>('COORDINATOR');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      await api('/api/users', json('POST', { fullName: name, email, password, role }));
      setNotice('Account created. Share the temporary password securely and have the user reset it.');
      setName('');
      setEmail('');
      setPassword('');
      await refresh();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Unable to create account.');
    } finally {
      setBusy(false);
    }
  }

  async function change(user: User, update: Partial<User>) {
    try {
      await api(
        '/api/users',
        json('PATCH', {
          id: user.id,
          role: update.role || user.role,
          isActive: update.isActive ?? user.isActive,
        }),
      );
      await refresh();
      setNotice('Access updated.');
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Unable to update access.');
    }
  }

  return (
    <main className="page-wrap page-space min-w-0">
      <PageTitle title="Website roles & access" subtitle="Server-enforced role permissions. Administrator only." />
      {error && <p className="error break-words">{error}</p>}

      <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(290px,1fr)] xl:gap-6">
        <Panel title="Accounts and roles" className="min-w-0 overflow-hidden">
          {/* Mobile: each account is a readable card with usable controls. */}
          <div className="space-y-3 md:hidden">
            {data?.users.map((user) => (
              <article key={user.id} className="min-w-0 rounded-lg border border-[#dae4ed] bg-[#f8fbfe] p-4">
                <h4 className="break-words font-semibold text-[#122c44] [overflow-wrap:anywhere]">
                  {user.fullName}
                </h4>
                <p className="mt-1 break-all text-xs text-[#748498]">{user.email}</p>

                <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 min-[420px]:grid-cols-[minmax(0,1fr)_auto] min-[420px]:items-end">
                  <div className="min-w-0">
                    <label htmlFor={`mobile-role-${user.id}`} className="mb-2 block text-xs font-semibold text-[#33495f]">
                      Account role
                    </label>
                    <select
                      id={`mobile-role-${user.id}`}
                      className="input w-full min-w-0 max-w-full"
                      value={user.role}
                      onChange={(event) => void change(user, { role: event.target.value as User['role'] })}
                    >
                      <option value="CLIENT">CLIENT</option>
                      <option value="COORDINATOR">COORDINATOR</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </div>
                  <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-3 text-sm font-medium text-[#33495f]">
                    <input
                      type="checkbox"
                      className="size-5 accent-[#0b4d98]"
                      checked={user.isActive}
                      onChange={(event) => void change(user, { isActive: event.target.checked })}
                    />
                    Active
                  </label>
                </div>
              </article>
            ))}
          </div>

          {/* Original account table on tablets and desktop. */}
          <div className="hidden min-w-0 overflow-x-auto md:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Role</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {data?.users.map((user) => (
                  <tr key={user.id}>
                    <td className="max-w-[230px] break-words [overflow-wrap:anywhere]">
                      <strong>{user.fullName}</strong>
                      <div className="hint break-all">{user.email}</div>
                    </td>
                    <td>
                      <select
                        aria-label={`Role for ${user.email}`}
                        value={user.role}
                        onChange={(event) => void change(user, { role: event.target.value as User['role'] })}
                        className="input min-w-[135px]"
                      >
                        <option value="CLIENT">CLIENT</option>
                        <option value="COORDINATOR">COORDINATOR</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Active ${user.email}`}
                        checked={user.isActive}
                        onChange={(event) => void change(user, { isActive: event.target.checked })}
                        className="size-5 accent-[#0b4d98]"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data?.users.length && <Empty title="No accounts loaded" />}
        </Panel>

        <Panel title="Create staff account" className="min-w-0 overflow-hidden">
          <form onSubmit={add} className="grid min-w-0 gap-5">
            <div className="min-w-0">
              <Field label="Full name">
                <input
                  className="w-full min-w-0 max-w-full"
                  required
                  minLength={2}
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
            </div>
            <div className="min-w-0">
              <Field label="Email address">
                <input
                  className="w-full min-w-0 max-w-full"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
            </div>
            <div className="min-w-0">
              <Field label="Initial secure password">
                <input
                  className="w-full min-w-0 max-w-full"
                  type="password"
                  required
                  minLength={12}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>
            </div>
            <div className="min-w-0">
              <Field label="Role">
                <select
                  className="w-full min-w-0 max-w-full"
                  value={role}
                  onChange={(event) => setRole(event.target.value as User['role'])}
                >
                  <option value="COORDINATOR">COORDINATOR</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="CLIENT">CLIENT</option>
                </select>
              </Field>
            </div>
            <button type="submit" className="btn w-full" disabled={busy}>
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </form>
          <p className="hint mt-5">
            Create staff/admin access here. Public registration always creates a Client account.
          </p>
        </Panel>
      </div>

      {notice && <div className="notice mt-5 break-words [overflow-wrap:anywhere]" role="status">{notice}</div>}
    </main>
  );
}
