# DM Events — Messaging fix (client, coordinator, administrator)

This patch applies to the DM Events Next.js App Router project, including the previously added free OpenStreetMap venue picker.

## Changes

- Messages > Inbox filters **client full name only**. Booking references, event types and message bodies no longer match searches. Placeholders and empty states reflect this behavior.
- The inbox list has an independent scrolling region on desktop and mobile (`min-height: 0`, `overflow-y: auto`), while the active conversation is independently scrollable and the composer remains pinned at the bottom. Automatic scroll is scoped to the chat region rather than `scrollIntoView` on the page.
- The message composer is available to **client, coordinator and administrator**, including photo attachments, keyboard send, optimistic sending, delivery status, typing indicators and read receipts. Administrators can send replies; clients now see administrator or coordinator read receipts.
- Messaging authorization is now independent of the Booking Management permission. Staff with `messages.staff` can read/send within the messaging module even when they do not have `bookings.view.all`. The inbox and message APIs use the same authorization boundary. Clients can access only bookings linked to their account.
- Realtime message/read/typing events use the same messaging-specific access scope, so chat remains live even if the coordinator's Booking Management module is disabled. Other booking-event changes still use booking permissions.
- Admin portal navigation includes its own `/admin/messages` link. A coordinator without booking-detail permissions does not see a shortcut to a page they cannot access.
- Staff replies from both admin and coordinator use the existing notification outbox kind `COORDINATOR_MESSAGE` for backwards compatibility; email/SMS wording is now role-neutral. The existing notification gateway integrations remain unchanged.

## Files

- `src/models/messaging.ts` (new)
- `src/models/read.ts`
- `app/api/messages/threads/route.ts`
- `app/api/messages/route.ts`
- `app/api/messages/typing/route.ts`
- `app/api/events/route.ts`
- `src/components/shared/MessagesPanel.tsx`
- `src/components/shared/MessagesPanel.module.css`
- `src/components/shared/SiteNav.tsx`
- `app/(portal)/coordinator/messages/page.tsx`
- `src/lib/notifications/providers.ts`
- `tests/fullscreen-messenger.test.cjs`
- `tests/realtime-messaging.test.cjs`
- `tests/spa-experience.test.cjs`
- `tests/messaging-role-and-scroll.test.cjs` (new)
- `docs/MESSAGING_FIX.md` (new)

## Install

1. Back up your existing project first.
2. Extract the changed-files patch into the existing project root. Keep the directory structure, overwriting paths when asked. Alternatively use the complete-source archive as the project base, adding back your own `.env` / deployment secrets.
3. No SQL migration is needed. Do not reset the database.
4. Use `npm ci` (or `npm install` if your existing deployment requires it), then `npm run typecheck`, `npm run build`, and `npm run dev`.
5. Test as client, coordinator and administrator: select a conversation, type, send, attach a photo, and view message updates and read receipts in another signed-in session.
6. Test coordinator with `messages.staff` allowed but `bookings.view.all` denied: chat still works, while the booking-detail shortcut is hidden.

## Verification / limitations

- The source repository's 154 Node test cases passed, including all new messaging tests. They test TS/TSX parsing, security boundaries and source integration; they do not replace browser integration tests.
- Full Next.js typecheck/production build and authenticated database/browser tests were **not** run here because npm dependency installation failed in the execution environment. Validate those in the actual project before deployment.
- No schema migrations or new environment variables are required. The already-configured Supabase Realtime publication and email/SMS gateway settings still apply.
- On sites with very large inboxes, a future server-side pagination strategy may be useful; this patch maintains the current API contract and makes the existing list scrollable.
