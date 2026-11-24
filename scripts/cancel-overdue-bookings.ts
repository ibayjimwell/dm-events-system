/** One-time rollout or manual recovery (run only AFTER migration 0014). */
import { cancelOverdueBookings } from '../src/lib/overdueBookings';

async function main() {
  let total = 0;
  let reversed = 0;
  for (let attempt = 0; attempt < 25; attempt++) {
    const result = await cancelOverdueBookings();
    total += result.cancelled;
    reversed += result.confirmedReversed;
    if (result.complete) {
      console.info(JSON.stringify({ ok: true, businessDate: result.today, cancelled: total, financialReversals: reversed }));
      return;
    }
  }
  console.error(JSON.stringify({ ok: false, cancelled: total, financialReversals: reversed, error: 'More overdue records remain; rerun this script.' }));
  process.exitCode = 1;
}

main().catch(error => {
  console.error('Unable to expire overdue bookings:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
});
