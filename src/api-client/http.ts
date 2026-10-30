import { beginApiRequest } from '@/lib/api-activity';
import { invalidateQuerySnapshots } from '@/lib/query-cache';

/** Same API contract as before; exposes request activity without caching private responses. */
export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const end = beginApiRequest();
  try {
    const headers = new Headers(opts.headers);
    if (opts.body && !(opts.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const res = await fetch(path, { ...opts, headers, cache: 'no-store' });
    const body: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const data = body && typeof body === 'object' ? body as { error?: unknown } : {};
      throw new Error(typeof data.error === 'string' ? data.error : `Request failed (${res.status})`);
    }
    // A successful mutation makes prior screen snapshots stale; the current
    // screen retains its rendered data until its own refresh completes.
    if ((opts.method ?? 'GET').toUpperCase() !== 'GET') invalidateQuerySnapshots();
    return body as T;
  } finally {
    end();
  }
}

export const json = (method: 'POST' | 'PATCH' | 'DELETE', body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
