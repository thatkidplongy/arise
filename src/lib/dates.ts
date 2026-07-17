const DAY_MS = 86_400_000;

/** Local calendar day as 'YYYY-MM-DD'. All quest bookkeeping is keyed by this. */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function shiftKey(key: string, deltaDays: number): string {
  const d = parseKey(key);
  d.setDate(d.getDate() + deltaDays);
  return dateKey(d);
}

/** Whole days from a to b (positive if b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / DAY_MS);
}

/** ISO 8601 week, e.g. '2026-W29'. Weekly quests reset when this changes (Mondays). */
export function weekKey(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function weekKeyOfDateKey(key: string): string {
  return weekKey(parseKey(key));
}
