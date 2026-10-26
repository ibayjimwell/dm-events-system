import { route, ok, HttpError } from '@/lib/http';
import {
  isISODate,
  isISOMonth,
  dateReservation,
  reservedDatesForMonth,
} from '@/lib/bookingAvailability';

export const dynamic = 'force-dynamic';

/** Returns no customer names, references, or contact details. */
export const GET = route(async (request) => {
  const params = new URL(request.url).searchParams;
  const month = params.get('month');
  if (month !== null) {
    if (!isISOMonth(month)) throw new HttpError(400, 'Valid month required (YYYY-MM).');
    return ok({ month, blockedDates: await reservedDatesForMonth(month) });
  }

  // Preserve the previously introduced date query for other screens.
  const date = params.get('date') ?? '';
  if (!isISODate(date)) throw new HttpError(400, 'Valid date required (YYYY-MM-DD).');
  const status = await dateReservation(date);
  return ok({ date, available: status === null, status });
});
