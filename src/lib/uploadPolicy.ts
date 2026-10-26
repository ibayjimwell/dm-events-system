import { can } from '@/lib/access';
import type { Actor } from '@/lib/auth';
import { HttpError } from '@/lib/http';

export const TEN_MB = 10 * 1024 * 1024;
export type DirectKind = 'INSPIRATION' | 'PACKAGE';
export const directKinds = ['INSPIRATION', 'PACKAGE'] as const;
export const imageMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;

export async function authorizeImageKind(user: Actor, kind: DirectKind) {
  const permission = kind === 'PACKAGE' ? 'packages.manage' : null;
  const authorized = permission
    ? await can(user, permission)
    : (await can(user, 'bookings.create.own')) || (await can(user, 'bookings.create.walkin'));
  if (!authorized) throw new HttpError(403, 'Image upload permission denied');
}

export function permittedImageFormat(format: string) {
  return format === 'jpg' || format === 'jpeg' || format === 'png' || format === 'webp';
}
