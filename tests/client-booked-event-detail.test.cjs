'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const route = read('app/(portal)/client/bookings/[id]/page.tsx');
const detail = read('src/components/client/BookedEventExperience.tsx');
const styles = read('src/components/client/BookedEventExperience.module.css');

test('actual client booking detail route renders the new component with a role permission guard', () => {
  assert.match(route, /pagePermission\('bookings\.view\.own'\)/);
  assert.match(route, /import BookedEventExperience from '@\/components\/client\/BookedEventExperience'/);
  assert.match(route, /return <BookedEventExperience id=\{id\}/);
  assert.match(route, /dynamic = 'force-dynamic'/);
  assert.match(detail, /data-client-booked-event-experience="v2"/);
});

test('updated experience reads authenticated booking details with skeleton and live refresh', () => {
  assert.match(detail, /useLiveQuery/);
  assert.match(detail, /`\/api\/bookings\/\$\{id\}`/);
  assert.match(detail, /<DetailSkeleton/);
  assert.match(detail, /refresh\(\)/);
  assert.match(detail, /role=\{error \? 'alert' : 'status'\}/);
});

test('client sees status-specific progress without treating tentative requests as reservations', () => {
  for (const status of ['TENTATIVE', 'HELD', 'CONFIRMED', 'CANCELLED']) {
    assert.match(detail, new RegExp(`${status}:`));
  }
  assert.match(detail, /not reserved yet/);
  assert.match(detail, /aria-label="Booking progress and support"/);
  assert.match(detail, /milestones\.map/);
});

test('client preferences can only change in tentative or held state, after review', () => {
  assert.match(detail, /booking\.status === 'TENTATIVE' \|\| booking\.status === 'HELD'/);
  assert.match(detail, /onSubmit=\{requestReview\}/);
  assert.match(detail, /BookingChangeDialog/);
  assert.match(detail, /if \(!confirmChanges \|\| busy \|\| !editable \|\| !booking\) return/);
  assert.match(detail, /json\('PATCH'/);
  assert.match(detail, /savedChanges/);
});

test('cancellation remains a request for staff review, not an automatic cancellation', () => {
  assert.match(detail, /`\/api\/bookings\/\$\{id\}\/cancel`/);
  assert.match(detail, /maxLength=\{2000\}/);
  assert.match(detail, /date won't be released automatically/i);
  assert.match(detail, /booking\.cancellationRequestedAt/);
});

test('new UI shows booking date, schedule, package, inclusions, inspiration, history and contact', () => {
  for (const field of [
    'booking.eventDate', 'booking?.eventStartTime', 'booking?.eventEndTime',
    'booking.guestCount', 'booking.package?.inclusions', 'booking.inspirationAssetId',
    'booking.history.map', 'booking.client?.email', 'booking.reviewNote',
  ]) {
    assert.ok(detail.includes(field), `Missing ${field}`);
  }
  assert.match(detail, /className=\{s.hero\}/);
  assert.match(detail, /className=\{s.heroVisual\}/);
  assert.match(detail, /className=\{s.contentGrid\}/);
  assert.match(detail, /className=\{s.progressCard\}/);
});

test('new UI uses scoped responsive CSS and accessible feedback', () => {
  assert.match(detail, /BookedEventExperience\.module\.css/);
  assert.match(detail, /role=\{feedback\.success \? 'status' : 'alert'\}/);
  assert.match(detail, /aria-expanded=\{editing\}/);
  assert.match(detail, /aria-label="Booking history"/);
  assert.match(styles, /@media \(max-width: 600px\)/);
  assert.match(styles, /prefers-reduced-motion/);
});
