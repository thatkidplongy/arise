/** Local calendar day as 'YYYY-MM-DD' — sent with every API call, because the
 * phone knows what "today" means better than the server does. */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format a 'YYYY-MM-DD' by hand — avoids the UTC-parsing off-by-one of new Date. */
export function prettyDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** Compact day for a table column: 'Today' / 'Yesterday' / 'Jul 15', relative to
 * `today` (a 'YYYY-MM-DD'). Kept short so it sits in a narrow trailing column. */
export function shortDay(day: string, today: string): string {
  if (day === today) return 'Today';
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  const [ty, tm, td] = today.split('-').map(Number);
  // Whole-day gap via UTC epoch of the calendar dates — no timezone drift.
  const diff = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86_400_000);
  if (diff === 1) return 'Yesterday';
  return `${MONTHS[m - 1]} ${d}`;
}
