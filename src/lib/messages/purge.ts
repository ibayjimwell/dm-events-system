import { and, eq, isNull, lte } from 'drizzle-orm';
import { db } from '@/db';
import { mediaAssets, messageReads, messageThreadDeletions, messageThreadPreferences,
  messageTyping, messages, bookings } from '@/db/schema';
import { cloud } from '@/lib/cloudinary';

/** Purges only expired, staff-deleted chats. Preserves the booking, financial ledger,
 * and a content-free tombstone so an empty conversation cannot silently reappear.
 * Failed remote deletes abort DB purge, and the next scheduled run retries safely.
 */
export async function purgeExpiredChats(batchSize = 10) {
  const now = new Date();
  const expired = await db.select({ bookingId: messageThreadDeletions.bookingId })
    .from(messageThreadDeletions)
    .where(and(isNull(messageThreadDeletions.purgedAt), lte(messageThreadDeletions.purgeAfter, now)))
    .limit(Math.min(Math.max(batchSize, 1), 25));
  const results = { checked: expired.length, purged: 0, failed: 0 };
  for (const item of expired) {
    try {
      await db.transaction(async tx => {
        // All message send/delete/restore operations lock this same booking row.
        await tx.select({ id: bookings.id }).from(bookings)
          .where(eq(bookings.id, item.bookingId)).for('update');
        const [deletion] = await tx.select().from(messageThreadDeletions)
          .where(eq(messageThreadDeletions.bookingId, item.bookingId)).for('update');
        if (!deletion || deletion.purgedAt || deletion.purgeAfter.getTime() > Date.now()) return;
        const files = await tx.select({ id: mediaAssets.id, publicId: mediaAssets.publicId,
          deliveryType: mediaAssets.deliveryType })
          .from(mediaAssets).where(and(eq(mediaAssets.bookingId, item.bookingId), eq(mediaAssets.kind, 'MESSAGE')));
        for (const file of files) {
          const response = await cloud().uploader.destroy(file.publicId, {
            resource_type: 'image', type: file.deliveryType === 'upload' ? 'upload' : 'authenticated', invalidate: true,
          });
          if (response.result !== 'ok' && response.result !== 'not found') {
            throw new Error('Cloud image deletion was not acknowledged');
          }
        }
        // Message assets are only used for this booking. Deleting the media DB row
        // invalidates /api/assets/:id immediately, even for the original uploader.
        await tx.delete(mediaAssets).where(and(eq(mediaAssets.bookingId, item.bookingId), eq(mediaAssets.kind, 'MESSAGE')));
        await tx.delete(messages).where(eq(messages.bookingId, item.bookingId));
        await tx.delete(messageReads).where(eq(messageReads.bookingId, item.bookingId));
        await tx.delete(messageTyping).where(eq(messageTyping.bookingId, item.bookingId));
        await tx.delete(messageThreadPreferences).where(eq(messageThreadPreferences.bookingId, item.bookingId));
        await tx.update(messageThreadDeletions).set({ purgedAt: new Date() })
          .where(eq(messageThreadDeletions.bookingId, item.bookingId));
        results.purged++;
      });
    } catch (error) {
      results.failed++;
      console.error('Failed to purge expired chat', item.bookingId, error);
    }
  }
  return results;
}
