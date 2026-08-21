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

/**
 * The last `count` calendar days ending at `today` (a 'YYYY-MM-DD'), most recent
 * first — the strip a form offers for back-dating an entry a few days.
 *
 * Walks a UTC epoch rather than mutating a local Date, so crossing a month or year
 * boundary can't land on a day that doesn't exist (the classic `setDate(0)` bug),
 * and DST can't make a step land twice on the same date.
 */
export function recentDays(today: string, count: number): string[] {
  const [y, m, d] = today.split('-').map(Number);
  if (!y || !m || !d || count < 1) return [];
  const start = Date.UTC(y, m - 1, d);
  return Array.from({ length: count }, (_, i) => new Date(start - i * 86_400_000).toISOString().slice(0, 10));
}
