/** A complete business report in one spreadsheet-compatible UTF-8 CSV file. */
export type ExportMovement = {
  reference: string;
  eventType: string;
  eventDate: string;
  recordedAt: Date;
  movementType: string;
  delta: string;
  after: string;
  note: string | null;
};

export type ExportMonth = { month: string; amount: string; gross: string; reductions: string; count: number };

export function phMonth(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).formatToParts(date);
  return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}`;
}
export function phDateTime(date: Date) {
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }).format(date);
}

export function csvCell(value: string | number | null | undefined) {
  let text = String(value ?? '');
  // Prevent spreadsheet formula injection even with whitespace prepended.
  if (typeof value === 'string' && /^\s*[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildAnalyticsCsv(args: { monthly: ExportMonth[]; movements: ExportMovement[]; month: string; movementType: string; exportedAt: Date }) {
  const { monthly, movements, month, movementType, exportedAt } = args;
  const selected = movements.filter(row =>
    (month === 'all' || phMonth(row.recordedAt) === month) &&
    (movementType === 'ALL' || row.movementType === movementType),
  );
  const totals = selected.reduce((acc, row) => {
    const value = Number(row.delta);
    acc.net += value;
    if (value >= 0) acc.positive += value;
    else acc.reductions -= value;
    if (row.movementType === 'CONFIRMATION') acc.confirmations++;
    else if (row.movementType === 'ADJUSTMENT') acc.adjustments++;
    else if (row.movementType === 'REVERSAL') acc.reversals++;
    return acc;
  }, { net: 0, positive: 0, reductions: 0, confirmations: 0, adjustments: 0, reversals: 0 });
  const byEvent = new Map<string, { movements: number; confirmations: number; net: number }>();
  for (const row of selected) {
    const event = row.eventType || 'Other';
    const group = byEvent.get(event) ?? { movements: 0, confirmations: 0, net: 0 };
    group.movements++;
    group.net += Number(row.delta);
    if (row.movementType === 'CONFIRMATION') group.confirmations++;
    byEvent.set(event, group);
  }

  const lines: string[][] = [];
  const push = (...cells: (string | number | null | undefined)[]) => lines.push(cells.map(csvCell));
  const blank = () => lines.push([]);
  push('DM EVENTS - MONTHLY CONFIRMED VALUE ANALYTICS');
  push('Exported at (Asia/Manila)', phDateTime(exportedAt));
  push('Reporting period', month === 'all' ? 'All months' : month);
  push('Movement filter', movementType === 'ALL' ? 'All movement types' : movementType);
  push('Currency', 'PHP');
  push('Report basis', 'Booking commitments (NOT cash received, revenue, profit, or payments). Movements are recognized in their recording month in Asia/Manila.');
  blank();
  push('SUMMARY - SELECTED PERIOD AND FILTER');
  push('Metric', 'Value');
  push('New confirmed bookings', totals.confirmations);
  push('Adjustment movements', totals.adjustments);
  push('Reversal movements', totals.reversals);
  push('Positive movements (PHP)', totals.positive.toFixed(2));
  push('Reductions and reversals (PHP)', totals.reductions.toFixed(2));
  push('Net confirmed-value movement (PHP)', totals.net.toFixed(2));
  push('Total ledger movements', selected.length);
  blank();
  push('MONTHLY TREND - ALL RECORDED MONTHS (UNFILTERED)');
  push('Month (Asia/Manila)', 'New confirmations', 'Positive movements (PHP)', 'Reductions (PHP)', 'Net movement (PHP)');
  for (const m of monthly) push(m.month, m.count, Number(m.gross).toFixed(2), Number(m.reductions).toFixed(2), Number(m.amount).toFixed(2));
  blank();
  push('EVENT TYPE BREAKDOWN - SELECTED PERIOD AND FILTER');
  push('Event type', 'Number of movements', 'New confirmations', 'Net movement (PHP)');
  for (const [event, count] of [...byEvent].sort((a, b) => b[1].net - a[1].net)) push(event, count.movements, count.confirmations, count.net.toFixed(2));
  blank();
  push('BOOKING MOVEMENTS - SELECTED PERIOD AND FILTER');
  push('Reference', 'Event type', 'Event date', 'Recorded at (Asia/Manila)', 'Movement type', 'Change (PHP)', 'Value after movement (PHP)', 'Note');
  for (const item of selected) push(item.reference, item.eventType, item.eventDate, phDateTime(item.recordedAt), item.movementType, Number(item.delta).toFixed(2), Number(item.after).toFixed(2), item.note);
  if (!selected.length) push('No movements in the selected period');
  return '\uFEFF' + lines.map(row => row.join(',')).join('\r\n') + '\r\n';
}
