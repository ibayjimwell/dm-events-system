import { beginApiRequest } from '@/lib/api-activity';
import { invalidateQuerySnapshots } from '@/lib/query-cache';

/** Typed failures preserve machine-readable auth states without parsing error text. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: { email?: string; emailVerified?: boolean; phoneVerified?: boolean },
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Same API contract as before; exposes request activity without caching private responses. */
export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const end = beginApiRequest();
  try {
    const headers = new Headers(opts.headers);
    if (opts.body && !(opts.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const res = await fetch(path, { ...opts, headers, cache: 'no-store' });
    const body: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const data = body && typeof body === 'object'
        ? body as Record<string, unknown>
        : {};
      throw new ApiError(
        typeof data.error === 'string' ? data.error : `Request failed (${res.status})`,
        res.status,
        typeof data.code === 'string' ? data.code : undefined,
        {
          email: typeof data.email === 'string' ? data.email : undefined,
          emailVerified: typeof data.emailVerified === 'boolean' ? data.emailVerified : undefined,
          phoneVerified: typeof data.phoneVerified === 'boolean' ? data.phoneVerified : undefined,
        },
      );
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
