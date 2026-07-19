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

/** Bucket items that are already ordered so same-day entries are adjacent (e.g.
 * newest-first) into day groups, preserving order. O(n) — only compares the last
 * bucket, so it relies on that ordering (both callers sort before calling). */
export function groupByDay<T extends { day: string }>(items: T[]): { day: string; items: T[] }[] {
  const out: { day: string; items: T[] }[] = [];
  for (const e of items) {
    const last = out[out.length - 1];
    if (last && last.day === e.day) last.items.push(e);
    else out.push({ day: e.day, items: [e] });
  }
  return out;
}
