import { api } from '@/api-client/http';

export type BookingAvailability = {
  date: string;
  available: boolean;
  status: 'HELD' | 'CONFIRMED' | null;
};

/** Recheck server availability instead of trusting a previously-rendered month. */
export async function assertAvailableDate(date: string): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Please select a preferred event date.');
  }
  const response = await api<BookingAvailability>(`/api/bookings/availability?date=${encodeURIComponent(date)}`);
  if (!response.available) {
    throw new Error('This date is now Held or Confirmed. Please choose another date.');
  }
}
