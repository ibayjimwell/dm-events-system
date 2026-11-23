/**
 * Pure chat-related presentation helpers. No network credentials or listeners.
 * These apply consistently to optimistic sends and fresh server responses.
 */
export type ChatThreadSummary = {
  id: string;
  reference: string;
  latest: { createdAt: string } | null;
  createdAt?: string;
};

const timestamp = (value?: string) => {
  if (!value) return 0;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : 0;
};

/** Sort newest activity first and ensure stable ordering for identical timestamps. */
export function sortChatThreads<T extends ChatThreadSummary>(threads: readonly T[]): T[] {
  return [...threads].sort((a, b) =>
    timestamp(b.latest?.createdAt ?? b.createdAt) - timestamp(a.latest?.createdAt ?? a.createdAt)
    || a.reference.localeCompare(b.reference)
    || a.id.localeCompare(b.id));
}

/** A typing event expires even if the other browser crashes without sending stop. */
export function isActiveTyping(expiry: string | number, now: number): boolean {
  const milliseconds = typeof expiry === 'number' ? expiry : timestamp(expiry);
  return milliseconds > now;
}
