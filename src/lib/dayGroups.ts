/** One calendar day's worth of anything dated, newest day first. */
export interface DayGroup<T> {
  /** 'YYYY-MM-DD'. */
  day: string;
  items: T[];
}

/**
 * Group dated items into one band per calendar day, newest first, with today
 * always present — empty or not, because "what happened today" is the question a
 * day-banded list opens on, and a missing band reads as a bug rather than a quiet
 * day.
 *
 * Item order inside a band is left exactly as given, so callers keep control of it
 * (the money ledger wants newest-first by clock; a to-do list wants oldest-first,
 * the order it was written).
 */
export function groupByDay<T>(items: readonly T[], dayOf: (item: T) => string, today: string): DayGroup<T>[] {
  const bands = new Map<string, T[]>();
  bands.set(today, []);
  for (const item of items) {
    const day = dayOf(item);
    const band = bands.get(day);
    if (band) band.push(item);
    else bands.set(day, [item]);
  }
  return [...bands.entries()]
    .map(([day, banded]) => ({ day, items: banded }))
    .sort((a, b) => b.day.localeCompare(a.day));
}
