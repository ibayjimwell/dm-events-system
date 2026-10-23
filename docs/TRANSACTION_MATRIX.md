# Transaction coverage matrix (PDF pages 31–57)

This checklist maps each of the source PDF's 27 steps to the actual website implementation. Pages 1–16 define the visual design and user portals; pages 17–23 document mobile/responsive layouts; pages 24–29 define security safeguards; pages 30–57 describe the complete transaction narrative.

| Step | PDF transaction | Implemented path / behavior |
|---|---|---|
| 01 | Browse packages | `/packages`, `/packages/[id]`; package records from admin-managed database, CTA begins booking |
| 02 | Account registration | `/register`, `POST /api/auth/register` creates custom CLIENT account, consent, optional verified email |
| 03 | Login & recovery | `/login`, `/forgot-password`, `/reset-password`; hashed passwords and tokenized recovery |
| 04 | Booking event details | `/client/book`, step 1; validates contact, event date, guests, budget, location and package |
| 05 | Booking photo/theme | `/client/book`, step 2; 1-MiB genuine-image validation, Cloudinary upload, generated internal name |
| 06 | Review & privacy consent | Step 2 displays summary and requires policy acknowledgment before sending |
| 07 | Booking confirmation | `/client/bookings/submitted`; reference and `TENTATIVE` status with view/message actions |
| 08 | Booking tracking | `/client/bookings`, `/client/bookings/[id]`; client-scoped status and recorded history |
| 09 | Coordinator messaging | `/client/messages` and `/coordinator/messages`; booking-linked secure thread; photos supported |
| 10 | Request cancellation | `/client/bookings/[id]`, `POST /api/bookings/[id]/cancel`; review request, does not automatically cancel |
| 11 | Mobile end-to-end | Responsive Tailwind CSS breakpoints for browser widths; no separate native app or phone frame |
| 12 | Coordinator inquiries | `/coordinator`, `/coordinator/requests`, `/coordinator/requests/[id]` |
| 13 | Date conflict verification | `/coordinator/calendar` and status API conflict detector with explicit override acknowledgment |
| 14 | Full calendar status legend | Calendar text + yellow tentative, blue held, green confirmed, red cancelled |
| 15 | Hold/confirm booking | `POST /api/bookings/[id]/status`, agreed value, audit, history, client realtime refresh |
| 16 | Reply to client | `/coordinator/messages?booking=...`, `POST /api/messages` |
| 17 | Cancellation update | Coordinator/administrator status action sets `CANCELLED`, appears red on calendar, removed from confirmed totals |
| 18 | Administrator dashboard | `/admin`, total requests, confirmed bookings, monthly booked value, operations snapshot |
| 19 | Monthly booked-value analytics | `/admin/analytics`, grouped by confirmation month; current month provisional |
| 20 | Analytics drill-down/export | `/admin/analytics`, `/api/report.csv` with confirmed booking records only |
| 21 | Package maintenance | `/admin/maintenance/packages`, edit/create/remove/publish/Cloudinary upload |
| 22 | Website content maintenance | `/admin/maintenance/content`, hero copy/image/contact/policy, draft/publish |
| 23 | User access maintenance | `/admin/maintenance/users`; create and manage role, active flag, protections |
| 24 | Automatic backup settings | `/admin/maintenance/settings`, daily policy + external cron `POST /api/cron/backup` |
| 25 | Backup history/restore | `/admin/maintenance/backups` real history; confirmed offline `npm run restore` (intentional operational safety boundary) |
| 26 | Privacy policy details | `/privacy`, registration consent, booking consent; editable admin text |
| 27 | Transaction lifecycle summary | Booking ID preserved across request, status history, messaging, calendars, admin reporting and audit |

## Important implementation decisions

- **Role-checked on the server.** Hiding a button is insufficient. Every protected route checks the user session and role; clients can read only their own booking data.
- **No unapproved staffing module.** The PDF explicitly excludes task/staff assignment. Coordinator-role accounts share operational review access; no per-coordinator assignment is inferred from the prototype.
- **No invented money.** The source's amounts are illustrative. Seeded packages have placeholder text only and require administrator editing. Booking values enter analytics only when authorized staff record them and mark the booking confirmed.
- **Restore is deliberately a CLI maintenance operation.** The prototype describes a restore button, but putting destructive production PostgreSQL restoration behind a routine web click would be unsafe. The code provides explicit multi-step operator confirmation and logs it.
- **Photos and database backups have separate retention requirements.** Cloudinary photos are not included in PostgreSQL dumps.
- **Production readiness remains unverified.** Connect your own services and complete the end-to-end checklist before collecting real data.
