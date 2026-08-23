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

/** '14 Aug' — the day a recall card was written, worn as its corner tag. Day-first
 * and yearless: the card is about how long ago, not about which year. */
export function dayMonth(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return `${d} ${MONTHS[m - 1]}`;
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

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 'Sat 22' for a 'YYYY-MM-DD' — how a dated band names a day inside one month. */
export function weekdayDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]} ${d}`;
}

/** A dated band's heading, relative to `today` (a 'YYYY-MM-DD'): 'Today · Sun 23',
 * 'Yesterday · Sat 22', then just 'Fri 21' — past two days old, the weekday carries it. */
export function formatDayBand(day: string, today: string): string {
  const relative = shortDay(day, today);
  if (relative === 'Today' || relative === 'Yesterday') return `${relative} · ${weekdayDay(day)}`;
  return weekdayDay(day);
}

/** Server timestamps arrive as naive UTC ('2026-08-22 12:40:53') — SQLite keeps no
 * zone — and Date() would read that as local wall-clock, shifting every time by the
 * timezone offset. Restores the UTC marker before parsing; zoned stamps pass through. */
export function toUtcIso(stamp: string): string {
  const t = stamp.trim().replace(' ', 'T');
  return /([zZ]|[+-]\d\d:?\d\d)$/.test(t) ? t : `${t}Z`;
}

/** '9:12 am' — a Date's local wall-clock, in the ledger's lowercase voice. */
export function formatClock(t: Date): string {
  if (Number.isNaN(t.getTime())) return '';
  const h = t.getHours();
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(t.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
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
