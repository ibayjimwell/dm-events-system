# DM Events — Completed booking reviews

## Installation

1. Back up your database before applying changes.
2. Extract the patch at the Next.js project root, preserving directories.
3. Run `npm ci`, `npm run db:migrate`, `npm run typecheck`, `npm run build` and deploy.
4. A staff account with `bookings.status` permission can mark a **CONFIRMED** booking **COMPLETED** on its event date or afterward (Asia/Manila date). Completed is final and cannot be reversed through the normal booking editor.
5. A signed-in client opens **My Bookings → Completed → booking details → Rate our service**. Choose 1–5 stars and write 20–1500 characters. The client can edit or republish one review per booking.
6. Publication is opt-in: check the checkbox to display the rating and comment on the public homepage. Unchecked feedback stays private and is not included in the public averages.
7. Only reviews for completed, online, client-owned bookings with publication consent appear on the public homepage (maximum six recent reviews). The public listing never exposes client names, phone numbers, contact details, booking references or exact event details. Landing page computes an average over all eligible published reviews.

## Files / migration

- `drizzle/0012_completed_booking_feedback.sql` adds the `COMPLETED` enum and `booking_service_feedback` table. The existing database minimum-value check still enforces the PHP 5,000 floor on values, and the completion status API additionally requires an agreed value at or above that floor.
- `src/db/schema.ts` models table and status.
- `src/lib/bookingCompletion.ts`, `src/lib/confirmedValue.ts` and status API handle completion and preserve financial commitments when transitioning Confirmed → Completed.
- `app/api/bookings/[id]/feedback/route.ts` handles private, authenticated review read/save. API validates owner, status, rating and comment and updates only the single review belonging to the booking.
- `src/models/serviceFeedback.ts`, homepage and HomeShowcase render opt-in reviews.
- Client and staff booking UIs provide the controls.

## Critical notes

- No existing confirmed bookings are automatically marked Completed. Staff must finish them explicitly after the event has occurred.
- Walk-in bookings without registered client accounts cannot submit portal reviews.
- A Completed booking retains its confirmed value in the value-movement ledger; completion does NOT book a reversal or payment.
- This patch does not implement review moderation. Public feedback becomes visible when the client opts in; you can add staff moderation later if desired.
- Deploy the migration before serving the new application code to avoid missing-column/table errors. Test using separate Client and Coordinator accounts.
