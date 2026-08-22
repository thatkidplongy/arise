import type { ApiHistoryItem } from '@/lib/api';
import { STAT_KEYS, type StatKey } from '@/types';

/** A Monday-to-Sunday window, as the client's own local days. */
export interface Week {
  start: string; // 'YYYY-MM-DD', a Monday
  end: string; // 'YYYY-MM-DD', the Sunday
}

/** What one week actually held, counted from the finished-quest log. */
export interface Recap {
  days: number; // distinct days anything was finished
  quests: number;
  xp: number;
  byStat: { key: StatKey; quests: number; xp: number }[];
  /** The attribute the week leaned into, or null on an empty week. */
  leaned: StatKey | null;
}

function shift(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const at = new Date(y, m - 1, d + delta);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/**
 * The week `offset` weeks back from the one containing `day`. Weeks start Monday,
 * because that's when the quest set rolls over and when the recap is written.
 */
export function weekOf(day: string, offset = 0): Week {
  const [y, m, d] = day.split('-').map(Number);
  const at = new Date(y, m - 1, d);
  // getDay() is 0 for Sunday, so Sunday belongs to the week that began six days back.
  const backToMonday = (at.getDay() + 6) % 7;
  const start = shift(day, -backToMonday + offset * 7);
  return { start, end: shift(start, 6) };
}

/** Whether a 'YYYY-MM-DD' falls inside a week, inclusive of both ends. */
export function inWeek(day: string, week: Week): boolean {
  return day >= week.start && day <= week.end;
}

/** Roll a week of finished quests into the numbers the recap shows. */
export function recapFor(history: ApiHistoryItem[], week: Week): Recap {
  const items = history.filter((h) => inWeek(h.day, week));
  const tally = new Map<StatKey, { quests: number; xp: number }>();
  const days = new Set<string>();

  for (const item of items) {
    days.add(item.day);
    const key = item.stat as StatKey;
    if (!STAT_KEYS.includes(key)) continue; // a quest whose attribute slug is gone
    const row = tally.get(key) ?? { quests: 0, xp: 0 };
    row.quests += 1;
    row.xp += item.xp;
    tally.set(key, row);
  }

  const byStat = STAT_KEYS.map((key) => ({ key, ...(tally.get(key) ?? { quests: 0, xp: 0 }) }));
  const leaned = byStat.reduce<{ key: StatKey; quests: number } | null>(
    (best, row) => (row.quests > 0 && (best == null || row.quests > best.quests) ? row : best),
    null,
  );

  return {
    days: days.size,
    quests: items.length,
    xp: items.reduce((sum, i) => sum + i.xp, 0),
    byStat,
    leaned: leaned?.key ?? null,
  };
}

/** "18 – 24 Aug" — the range, said the way you'd say it out loud. */
export function weekLabel(week: Week): string {
  const at = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const start = at(week.start);
  const end = at(week.end);
  const sameMonth = start.getMonth() === end.getMonth();
  const left = start.toLocaleDateString(undefined, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
  const right = end.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${left} – ${right}`;
}
